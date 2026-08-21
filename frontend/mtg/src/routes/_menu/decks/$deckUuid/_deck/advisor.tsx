import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { Button, EmptyState, LocalTab, TabMenu, notify } from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CutCandidate, Suggestion } from "src/api/graph-generated";
import { DeckAdvisorCombos } from "src/components/deck-advisor-combos";
import { DeckAdvisorCuts } from "src/components/deck-advisor-cuts";
import type { SwapAdd } from "src/components/deck-advisor-cuts";
import { DeckAdvisorDiagnostics } from "src/components/deck-advisor-diagnostics";
import { DeckAdvisorOffTheme } from "src/components/deck-advisor-off-theme";
import { DeckAdvisorSpeed } from "src/components/deck-advisor-speed";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorSuggestions } from "src/components/deck-advisor-suggestions";
import { DeckFillDialog } from "src/components/deck-fill-dialog";
import { DeckIgnoreDialog } from "src/components/deck-ignore-dialog";
import { advisorDeck, bracketSpeed } from "src/utils/deck-advisor";
import { IgnoredCard, readIgnored, writeIgnored } from "src/utils/deck-ignore";
import { readSpeedOverride, writeSpeedOverride } from "src/utils/deck-speed";
import {
    DEFAULT_THEME_PREFS,
    ThemePrefs,
    cycleTheme,
    pruneThemePrefs,
    readThemePrefs,
    writeThemePrefs,
} from "src/utils/deck-theme-prefs";
import { resolveLookups } from "src/utils/printing-catalog";
import { useDeckCombos } from "src/utils/use-deck-combos";
import { useDeckAnalysis } from "src/utils/use-deck-analysis";
import { useDeckSwaps } from "src/utils/use-deck-swaps";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/** The advisor's sections; diagnostics is the default and stays out of the URL */
type AdvisorSection = "diagnostics" | "adds" | "cuts" | "combos";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/advisor")({
    validateSearch: (search: Record<string, unknown>): { section?: AdvisorSection } => ({
        section:
            search.section === "adds" || search.section === "cuts" || search.section === "combos"
                ? search.section
                : undefined,
    }),
    loader: ({ params }) => Api.decks.cards.list(params.deckUuid),
    component: RouteComponent,
});

/** The surface the adds and cuts lists sit on, matching the diagnostics panels */
const PANEL =
    "flex flex-col rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10";

/**
 * The graph advisor's read of the deck: diagnostics, suggested adds, and cuts.
 *
 * Everything here comes from the mtg-graph service and is opinion — the
 * statistics tab keeps the plain facts. An unreachable graph therefore
 * degrades to a note where the panels would be, never to the error screen.
 *
 * An add files the resolved printing into the mainboard and a cut takes one
 * copy out; both then invalidate the router, so the deck, the diagnostics and
 * the suggestions move together.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { section = "diagnostics" } = Route.useSearch();
    const { cards } = Route.useLoaderData();
    const { deck, brackets } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("advisor");
    const router = useRouter();
    const navigate = useNavigate({ from: Route.fullPath });
    const [busyOracle, setBusyOracle] = useState<string | null>(null);
    const [speedOverride, setSpeedOverride] = useState<number | null>(null);
    const [ignored, setIgnored] = useState<Array<IgnoredCard>>([]);
    const [themePrefs, setThemePrefs] = useState<ThemePrefs>(DEFAULT_THEME_PREFS);
    // What the advisor talked the user into, this session.
    //
    // Not persisted, and deliberately: it exists to stop the tool contradicting
    // its own advice one click later, not to make a card permanently uncuttable.
    // A deck reopened tomorrow is a fresh judgement, and by then the card has
    // had a chance to earn its slot on the same terms as everything else.
    const [accepted, setAccepted] = useState<Array<string>>([]);
    const [filling, setFilling] = useState(false);
    const [managingIgnored, setManagingIgnored] = useState(false);

    // Read per deck: the route component survives a switch to another deck.
    useEffect(() => {
        setSpeedOverride(readSpeedOverride(deckUuid));
        setIgnored(readIgnored(deckUuid));
        setThemePrefs(readThemePrefs(deckUuid));
        setAccepted([]);
    }, [deckUuid]);

    const advisor = useMemo(() => advisorDeck(cards), [cards]);
    const commander = deck.format === "commander";
    const speed = speedOverride ?? bracketSpeed(deck.bracket);
    const excludedIds = useMemo(() => ignored.map((card) => card.oracle_id), [ignored]);
    const analysis = useDeckAnalysis(advisor, speed, commander);
    const swaps = useDeckSwaps(
        advisor,
        speed,
        excludedIds,
        themePrefs,
        accepted,
        commander && (section === "adds" || section === "cuts"),
    );
    const playedNames = useMemo(
        () =>
            cards
                .filter((slot) => slot.zone === "Main" || slot.zone === "Commander")
                .flatMap((slot) => (slot.card?.name == null ? [] : [slot.card.name])),
        [cards],
    );
    const combos = useDeckCombos(advisor, playedNames, excludedIds, commander && section === "combos");
    // Both sides of every exchange, so the cuts tab has artwork for the card
    // being given up as well as the ones offered for its slot.
    const suggestionNames = useMemo(
        () =>
            swaps.data === null
                ? []
                : [
                      ...new Set([
                          ...swaps.data.suggestions.suggestions.map((s) => s.name),
                          ...swaps.data.swaps.map((swap) => swap.cut.name),
                      ]),
                  ],
        [swaps],
    );
    const suggestionCards = useSuggestionCards(suggestionNames);

    /**
     * Switches the visible section, keeping the default out of the URL
     *
     * @param next the section to show
     */
    function show(next: AdvisorSection) {
        void navigate({
            search: () => (next === "diagnostics" ? {} : { section: next }),
            replace: true,
        });
    }

    /**
     * Marks a card as one the advisor argued for, so it stops arguing against it
     *
     * @param oracleId the card that was accepted
     */
    function defend(oracleId: string) {
        setAccepted((held) => (held.includes(oracleId) ? held : [...held, oracleId]));
    }

    /**
     * Files one copy of a suggestion into the mainboard
     *
     * @param suggestion the accepted suggestion
     */
    async function add(suggestion: Suggestion) {
        const printing = suggestionCards.get(suggestion.name);
        if (printing === undefined) return;
        setBusyOracle(suggestion.oracle_id);
        try {
            await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone: "Main" });
            notify.success(t("toast.card-added", { name: suggestion.name }));
            // Before the invalidate, so the refetch it triggers already knows
            // not to offer this card straight back as a cut.
            defend(suggestion.oracle_id);
            await router.invalidate();
        } finally {
            setBusyOracle(null);
        }
    }

    /**
     * Files the missing piece of a combo into the mainboard, placed by name
     *
     * @param name the missing card's name
     * @param oracleId its oracle identity, for the busy marker
     */
    async function addByName(name: string, oracleId: string) {
        setBusyOracle(oracleId);
        try {
            const [placed] = await resolveLookups([{ name }]);
            if (placed === null) return;
            await Api.decks.cards.add(deckUuid, { printing: placed.id, quantity: 1, zone: "Main" });
            notify.success(t("toast.card-added", { name }));
            defend(oracleId);
            await router.invalidate();
        } finally {
            setBusyOracle(null);
        }
    }

    /**
     * Walks one theme to its next state, and retires opinions about themes
     * the service has stopped reporting.
     *
     * Pruned against a report the service actually answered — never a guess,
     * or one failed request would wipe real preferences.
     *
     * @param themeId the theme that was clicked
     */
    function cycleThemePref(themeId: string) {
        const live = analysis.data?.themes?.map((theme) => theme.theme);
        const cycled = cycleTheme(themePrefs, themeId);
        const next = live === undefined ? cycled : pruneThemePrefs(cycled, [...live, themeId]);
        setThemePrefs(next);
        writeThemePrefs(deckUuid, next);
    }

    /*
     * Names for themes the deck does not read as, so an excluded one keeps its
     * proper label on the chip that undoes it. Both sources are needed and
     * neither is enough: `off_theme` carries the label while the theme is
     * still being offered, `excluded` once the offer has been taken.
     */
    const themeLabels = Object.fromEntries(
        [
            ...(swaps.data?.suggestions.off_theme ?? []).map((lean) => [lean.theme, lean.label]),
            ...(swaps.data?.suggestions.excluded ?? []).map((focus) => [focus.value, focus.label]),
        ].filter(([, label]) => label !== undefined && label !== ""),
    );

    /**
     * Excludes one theme outright, rather than cycling to it.
     *
     * The off-theme banner names a theme the deck does *not* play, so its
     * chip — if one exists at all — sits at neutral, and a cycle from there
     * lands on pinned. Offering "exclude" and pinning instead would be the
     * opposite of the request.
     *
     * Not pruned against the live themes: the whole case for excluding this
     * one is that the deck does not read as it, so pruning would drop the
     * opinion the moment it was recorded.
     *
     * @param themeId the theme to steer away from
     */
    function excludeThemePref(themeId: string) {
        const next = {
            pinned: themePrefs.pinned.filter((id) => id !== themeId),
            excluded: [...new Set([...themePrefs.excluded, themeId])],
        };
        setThemePrefs(next);
        writeThemePrefs(deckUuid, next);
    }

    /**
     * Rules a suggestion out for good — the advisor never offers it again
     *
     * @param suggestion the turned-down suggestion
     */
    function ignore(suggestion: Suggestion) {
        if (ignored.some((held) => held.oracle_id === suggestion.oracle_id)) return;
        const next = [...ignored, { oracle_id: suggestion.oracle_id, name: suggestion.name }];
        setIgnored(next);
        writeIgnored(deckUuid, next);
        // Said and undoable: the eye sits beside the plus, and without this a
        // misclick silently suppresses a card for good — the list simply
        // rebuilds a moment later with no account of why.
        notify.success(t("toast.card-ignored", { name: suggestion.name }), {
            onClick: () => unignore({ oracle_id: suggestion.oracle_id, name: suggestion.name }),
        });
    }

    /**
     * Lets an ignored card back in
     *
     * @param card the card to allow again
     */
    function unignore(card: IgnoredCard) {
        const next = ignored.filter((held) => held.oracle_id !== card.oracle_id);
        setIgnored(next);
        writeIgnored(deckUuid, next);
    }

    /**
     * Trades one card for another: the add goes in, the cut comes out.
     *
     * Added before removed, deliberately. Neither order is atomic — the deck
     * API has no endpoint that does both — and of the two ways to fail, ending
     * up holding an extra card is recoverable in a way that a silently missing
     * one is not.
     *
     * @param cut the card being given up
     * @param add the card taking its slot
     */
    async function swap(cut: CutCandidate, add: SwapAdd) {
        const printing = suggestionCards.get(add.name);
        if (printing === undefined) return;
        setBusyOracle(cut.oracle_id);
        try {
            await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone: "Main" });
            await removeOneCopy(cut);
            notify.success(t("toast.card-swapped", { out: cut.name, in: add.name }));
            defend(add.oracle_id);
            await router.invalidate();
        } finally {
            setBusyOracle(null);
        }
    }

    /**
     * Takes one copy of a card out of the mainboard, by oracle identity
     *
     * @param cut the card to reduce
     */
    async function removeOneCopy(cut: CutCandidate) {
        const slot = cards.find((held) => held.zone === "Main" && held.card?.oracle_id === cut.oracle_id);
        if (slot === undefined) return;
        if (slot.quantity > 1) {
            await Api.decks.cards.update(deckUuid, slot.uuid, { quantity: slot.quantity - 1 });
        } else {
            await Api.decks.cards.delete(deckUuid, slot.uuid);
        }
    }

    if (!commander) {
        return <EmptyState title={t("heading.commander-only")} description={t("description.commander-only")} />;
    }
    if (advisor.entries.length === 0) {
        return <EmptyState title={t("heading.empty-deck")} description={t("description.empty-deck")} />;
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-wrap items-center justify-between gap-4"}>
                <TabMenu>
                    <LocalTab active={section === "diagnostics"} onClick={() => show("diagnostics")}>
                        {t("heading.diagnostics")}
                    </LocalTab>
                    <LocalTab active={section === "adds"} onClick={() => show("adds")}>
                        {t("heading.suggestions")}
                    </LocalTab>
                    <LocalTab active={section === "cuts"} onClick={() => show("cuts")}>
                        {t("heading.cuts")}
                    </LocalTab>
                    <LocalTab active={section === "combos"} onClick={() => show("combos")}>
                        {t("heading.combos")}
                    </LocalTab>
                </TabMenu>
                <div className={"flex flex-wrap items-center gap-4"}>
                    <DeckAdvisorSpeed
                        speed={speed}
                        overridden={speedOverride !== null}
                        brackets={brackets}
                        onChange={(next) => {
                            setSpeedOverride(next);
                            writeSpeedOverride(deckUuid, next);
                        }}
                        onReset={() => {
                            setSpeedOverride(null);
                            writeSpeedOverride(deckUuid, null);
                        }}
                    />
                    {ignored.length > 0 && (
                        <button
                            type={"button"}
                            onClick={() => setManagingIgnored(true)}
                            className={
                                "rounded-(--radius-pill) px-2.5 py-1 text-xs font-medium text-zinc-500 ring-1 ring-zinc-950/10 transition hover:bg-zinc-950/5 dark:text-zinc-400 dark:ring-white/15 dark:hover:bg-white/10"
                            }
                        >
                            {t("button.ignored", { amount: ignored.length })}
                        </button>
                    )}
                    <Button outline onClick={() => setFilling(true)}>
                        {t("button.fill")}
                    </Button>
                </div>
            </div>

            {/* Above the sections, not inside one: the lean is a property of
                the whole answer, and it is as true of the swaps as of the adds. */}
            {swaps.data !== null && (
                <DeckAdvisorOffTheme leans={swaps.data.suggestions.off_theme ?? []} onExclude={excludeThemePref} />
            )}

            {section === "diagnostics" && (
                <DeckAdvisorDiagnostics
                    analysis={analysis}
                    unknown={advisor.unknown}
                    themePrefs={themePrefs}
                    onCycleTheme={cycleThemePref}
                    themeLabels={themeLabels}
                />
            )}

            {/* Each section shows the last answer it has while the next one
                is computed — accepting a card must not blank the list it was
                accepted from — and falls back to the placeholder only when
                there is nothing to show at all. */}
            {(section === "adds" || section === "cuts") && swaps.data === null && (
                <DeckAdvisorState state={swaps.state} />
            )}
            {section === "adds" && swaps.data !== null && (
                <div className={PANEL} aria-busy={swaps.stale}>
                    <DeckAdvisorSuggestions
                        report={swaps.data.suggestions}
                        cards={suggestionCards}
                        onAdd={(suggestion) => void add(suggestion)}
                        onIgnore={ignore}
                        busyOracle={busyOracle}
                        stale={swaps.stale}
                    />
                </div>
            )}
            {section === "cuts" && swaps.data !== null && (
                <div className={PANEL} aria-busy={swaps.stale}>
                    <DeckAdvisorCuts
                        swaps={swaps.data.swaps}
                        cards={suggestionCards}
                        onSwap={(cut, add) => void swap(cut, add)}
                        busyOracle={busyOracle}
                    />
                </div>
            )}

            {section === "combos" && combos.data === null && <DeckAdvisorState state={combos.state} />}
            {section === "combos" && combos.data !== null && (
                <div className={PANEL} aria-busy={combos.stale}>
                    <DeckAdvisorCombos
                        combos={combos.data}
                        onAdd={(name, oracleId) => void addByName(name, oracleId)}
                        busyOracle={busyOracle}
                    />
                </div>
            )}

            <DeckFillDialog
                open={filling}
                onClose={() => setFilling(false)}
                deckUuid={deckUuid}
                deck={advisor}
                speed={speed}
                excluded={excludedIds}
                onFilled={() => void router.invalidate()}
            />

            <DeckIgnoreDialog
                open={managingIgnored}
                onClose={() => setManagingIgnored(false)}
                ignored={ignored}
                onUnignore={unignore}
            />
        </div>
    );
}
