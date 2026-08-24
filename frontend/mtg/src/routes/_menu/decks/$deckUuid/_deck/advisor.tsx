import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { Button, EmptyState, LocalTab, TabMenu, notify } from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckCardResponse } from "src/api/generated";
import { CutCandidate, Suggestion } from "src/api/graph-generated";
import { DeckAdvisorCombos } from "src/components/deck-advisor-combos";
import { DeckAdvisorCuts } from "src/components/deck-advisor-cuts";
import type { SwapAdd } from "src/components/deck-advisor-cuts";
import { DeckAdvisorDiagnostics } from "src/components/deck-advisor-diagnostics";
import { DeckAdvisorOffTheme } from "src/components/deck-advisor-off-theme";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorSuggestions } from "src/components/deck-advisor-suggestions";
import { DeckFillDialog } from "src/components/deck-fill-dialog";
import { DeckIgnoreDialog } from "src/components/deck-ignore-dialog";
import { advisorDeck, bracketSpeed } from "src/utils/deck-advisor";
import { IgnoredCard, readIgnored, writeIgnored } from "src/utils/deck-ignore";
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
    const { deck } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("advisor");
    const router = useRouter();
    const navigate = useNavigate({ from: Route.fullPath });
    const [busyOracle, setBusyOracle] = useState<string | null>(null);
    const [ignored, setIgnored] = useState<Array<IgnoredCard>>([]);
    const [themePrefs, setThemePrefs] = useState<ThemePrefs>(DEFAULT_THEME_PREFS);
    // The cards that are not up for discussion this session: the ones the
    // advisor talked the user into, and the ones the user said they are
    // keeping.
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
        setIgnored(readIgnored(deckUuid));
        setThemePrefs(readThemePrefs(deckUuid));
        setAccepted([]);
    }, [deckUuid]);

    const advisor = useMemo(() => advisorDeck(cards), [cards]);
    const commander = deck.format === "commander";
    // The deck's bracket, and nothing else: it is the deck's own statement
    // about how hard it plays, it sits on the chip beside the deck's name, and
    // a second dial for the same thing here only ever disagreed with it.
    const speed = bracketSpeed(deck.bracket);
    const excludedIds = useMemo(() => ignored.map((card) => card.oracle_id), [ignored]);
    // The backend only defends the single `commander_oracle_id` it was told
    // about, but a Partner deck plays two — so both must ride along as
    // protected, or the second commander is a legal cut. Sorted: it feeds a
    // cache key in `useDeckSwaps`, and a stable order keeps that key from
    // thrashing when the same set comes back in a different sequence.
    const commanderIds = useMemo(
        () =>
            cards
                .filter((slot) => slot.zone === "Commander")
                .flatMap((slot) => (slot.card?.oracle_id == null ? [] : [slot.card.oracle_id])),
        [cards],
    );
    const protectedIds = useMemo(() => [...new Set([...accepted, ...commanderIds])].sort(), [accepted, commanderIds]);
    const analysis = useDeckAnalysis(advisor, speed, commander);
    const swaps = useDeckSwaps(
        advisor,
        speed,
        excludedIds,
        themePrefs,
        protectedIds,
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
    const {
        cards: suggestionCards,
        state: suggestionCardsState,
        retry: retrySuggestionCards,
    } = useSuggestionCards(suggestionNames);

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
     * Rules a card out for good — the advisor never offers it again.
     *
     * Takes the pair rather than a whole suggestion: the same button sits on
     * the adds list and on every card offered for a freed slot, and the two
     * sides of the page name a card in different shapes.
     *
     * @param suggestion the turned-down card
     */
    function ignore(suggestion: IgnoredCard) {
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
     * The outgoing card's Main-zone slot is located first — if the deck no
     * longer holds one (it was already cut, or moved, in another tab) the
     * swap is refused with an error rather than silently turning into a
     * one-sided add. Only once that slot is confirmed does the add happen,
     * followed by the removal: neither order is atomic — the deck API has no
     * endpoint that does both — and of the two ways to fail, ending up
     * holding an extra card is recoverable in a way that a silently missing
     * one is not.
     *
     * @param going the card being given up
     * @param add the card taking its slot
     */
    async function swap(going: CutCandidate, add: SwapAdd) {
        const printing = suggestionCards.get(add.name);
        if (printing === undefined) return;
        const slot = cards.find((held) => held.zone === "Main" && held.card?.oracle_id === going.oracle_id);
        if (slot === undefined) {
            notify.error(t("toast.cut-not-in-deck"));
            return;
        }
        setBusyOracle(going.oracle_id);
        try {
            await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone: "Main" });
            await removeSlot(slot);
            notify.success(t("toast.card-swapped", { out: going.name, in: add.name }));
            defend(add.oracle_id);
            await router.invalidate();
        } finally {
            setBusyOracle(null);
        }
    }

    /**
     * Takes one copy out and puts nothing back.
     *
     * The exchange is the advisor's argument, not its terms: a slot is worth
     * freeing whether or not any of the cards offered for it appeals, and
     * without this the only way to act on a cut the reader agrees with is to
     * accept a card they do not want.
     *
     * @param candidate the card to let go
     */
    async function cut(candidate: CutCandidate) {
        setBusyOracle(candidate.oracle_id);
        try {
            const gone = await removeOneCopy(candidate);
            if (gone === null) {
                notify.error(t("toast.cut-not-in-deck"));
                return;
            }
            // Undoable, like the ignore beside it: this one edits the deck, so
            // a misclick costs a card rather than a suggestion.
            notify.success(t("toast.card-cut", { name: candidate.name }), {
                onClick: () => void restore(gone, candidate.name),
            });
            await router.invalidate();
        } finally {
            setBusyOracle(null);
        }
    }

    /**
     * Puts a cut copy back, in the printing and finish it was
     *
     * @param slot the slot the copy came out of
     * @param name the card's name, for the toast
     */
    async function restore(slot: DeckCardResponse, name: string) {
        await Api.decks.cards.add(deckUuid, {
            printing: slot.printing,
            quantity: 1,
            zone: "Main",
            foil: slot.foil,
        });
        notify.success(t("toast.card-added", { name }));
        await router.invalidate();
    }

    /**
     * Takes a card off the table: the advisor stops proposing it as a cut.
     *
     * Session-scoped like everything in `accepted` — see the comment there.
     * The whole exchange goes with it, because every add on the row was only
     * ever offered for this card's slot.
     *
     * @param candidate the card being kept
     */
    function keep(candidate: CutCandidate) {
        if (accepted.includes(candidate.oracle_id)) return;
        defend(candidate.oracle_id);
        notify.success(t("toast.card-kept", { name: candidate.name }), {
            onClick: () => setAccepted((held) => held.filter((oracleId) => oracleId !== candidate.oracle_id)),
        });
    }

    /**
     * Takes one copy of a card out of the mainboard, by oracle identity
     *
     * @param candidate the card to reduce
     *
     * @returns the slot it came out of, so the copy can be put back, or `null`
     *   when the deck no longer holds one
     */
    async function removeOneCopy(candidate: CutCandidate): Promise<DeckCardResponse | null> {
        const slot = cards.find((held) => held.zone === "Main" && held.card?.oracle_id === candidate.oracle_id);
        if (slot === undefined) return null;
        await removeSlot(slot);
        return slot;
    }

    /**
     * Takes one copy out of a known Main-zone slot
     *
     * @param slot the slot to reduce, as already located by the caller
     */
    async function removeSlot(slot: DeckCardResponse): Promise<void> {
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
                    {/* Only when there is nothing to read: a deck that claims a
                        bracket wears it on the chip beside its name, and the
                        advice follows it. A deck that claims none is being held
                        to an assumption, and an unsaid assumption is the one
                        thing this page must not have. */}
                    {deck.bracket == null && (
                        <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                            {t("label.no-bracket", { number: Math.round(speed * 4) + 1 })}
                        </span>
                    )}
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
                        cardsState={suggestionCardsState}
                        onRetryCards={retrySuggestionCards}
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
                        cardsState={suggestionCardsState}
                        onRetryCards={retrySuggestionCards}
                        onSwap={(going, add) => void swap(going, add)}
                        onCut={(going) => void cut(going)}
                        onKeep={keep}
                        onIgnoreAdd={ignore}
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
