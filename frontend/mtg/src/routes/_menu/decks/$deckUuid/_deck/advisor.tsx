import { AdjustmentsHorizontalIcon } from "@heroicons/react/16/solid";
import { createFileRoute, isRedirect, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { Button, EmptyState, LocalTab, TabMenu, notify } from "components";
import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckCardResponse } from "src/api/generated";
import { CutCandidate, Suggestion } from "src/api/graph-generated";
import { DeckAdvisorCombos } from "src/components/deck-advisor-combos";
import { DeckAdvisorCuts } from "src/components/deck-advisor-cuts";
import type { SwapAdd } from "src/components/deck-advisor-cuts";
import { DeckAdvisorDiagnostics } from "src/components/deck-advisor-diagnostics";
import { DeckAdvisorAssumptions } from "src/components/deck-advisor-assumptions";
import { DeckAdvisorOffTheme } from "src/components/deck-advisor-off-theme";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorSuggestions } from "src/components/deck-advisor-suggestions";
import { DeckAdvisorUpdating } from "src/components/deck-advisor-updating";
import { DeckFillDialog } from "src/components/deck-fill-dialog";
import { QuietButton } from "src/components/quiet-button";
import { advisorDeck, bracketSpeed, filterReport, filterSwaps } from "src/utils/deck-advisor";
import { IgnoredCard, readIgnored, writeIgnored } from "src/utils/deck-ignore";
import { readPoolQuery, writePoolQuery } from "src/utils/deck-pool";
import {
    Corridor,
    DEFAULT_TARGETS,
    DeckTargets,
    readTargets,
    withCorridor,
    withCurve,
    withoutCorridor,
    withoutCurve,
    writeTargets,
} from "src/utils/deck-targets";
import { deckRuleZero, houseRulesSummary } from "src/utils/deck-rules";
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
import { useEdhrecWarm } from "src/utils/use-edhrec-warm";
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
    const { deck, formats, brackets } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("advisor");
    const router = useRouter();
    const navigate = useNavigate({ from: Route.fullPath });
    const [busyOracle, setBusyOracle] = useState<string | null>(null);
    const [ignored, setIgnored] = useState<Array<IgnoredCard>>([]);
    const [themePrefs, setThemePrefs] = useState<ThemePrefs>(DEFAULT_THEME_PREFS);
    // What this deck is graded against, where the builder moved it off the
    // bracket's numbers. A lens on the advice like the two above, and kept in
    // the same place for the same reason.
    const [targets, setTargets] = useState<DeckTargets>(DEFAULT_TARGETS);
    // Which cards the advisor may draw from at all — a lens on the advice like
    // the ignore list, kept on the device rather than on the deck.
    const [poolQuery, setPoolQuery] = useState<string | null>(null);
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
    const [showingAssumptions, setShowingAssumptions] = useState(false);

    // Read per deck: the route component survives a switch to another deck.
    useEffect(() => {
        setIgnored(readIgnored(deckUuid));
        setThemePrefs(readThemePrefs(deckUuid));
        setTargets(readTargets(deckUuid));
        setPoolQuery(readPoolQuery(deckUuid));
        setAccepted([]);
    }, [deckUuid]);

    const rules = formats.find((format) => format.slug === deck.format);
    // What the deck is actually built to, the commanders counted in — the
    // agreed size when the table set one, the format's number otherwise, read
    // exactly the way `checkDeck` reads it. The projection turns it into the
    // number the graph means by "deck size".
    const target = deckRuleZero(deck).deckSize ?? rules?.deck_size.cards ?? null;
    const advisor = useMemo(
        () => advisorDeck(cards, { allowedColorIdentity: deck.allowed_color_identity, targetSize: target }),
        [cards, deck.allowed_color_identity, target],
    );
    // Said above the advice, because every panel below is graded against it.
    const houseRules = useMemo(() => houseRulesSummary(deck, cards, rules), [deck, cards, rules]);
    const commander = deck.format === "commander";
    // The deck's bracket, and nothing else: it is the deck's own statement
    // about how hard it plays, it sits on the chip beside the deck's name, and
    // a second dial for the same thing here only ever disagreed with it.
    const speed = bracketSpeed(deck.bracket);
    const excludedIds = useMemo(() => ignored.map((card) => card.oracle_id), [ignored]);
    // What the user accepted this session — `keep` is the advisor not
    // contradicting its own advice one click later, nothing more. The
    // commanders are not in here: the backend is told the whole command zone
    // and defends it itself.
    const protectedIds = useMemo(() => [...new Set(accepted)].sort(), [accepted]);
    const analysis = useDeckAnalysis(advisor, speed, commander, targets);
    const swaps = useDeckSwaps(
        advisor,
        speed,
        excludedIds,
        themePrefs,
        protectedIds,
        poolQuery,
        targets,
        commander && (section === "adds" || section === "cuts"),
    );
    // The answer on screen may be provisional: a cold commander's EDHREC data
    // is fetched in the background rather than inside the request, and the
    // service says so. Watching for that warm to land is what turns the note
    // into a real answer without the reader having to touch anything.
    const edhrecPending = useMemo(
        () => (swaps.data?.suggestions.notes ?? []).some((note) => note.code === "edhrec-pending"),
        [swaps.data],
    );
    useEdhrecWarm(advisor.commanders, edhrecPending);
    const playedNames = useMemo(
        () =>
            cards
                .filter((slot) => slot.zone === "Main" || slot.zone === "Commander")
                .flatMap((slot) => (slot.card?.name == null ? [] : [slot.card.name])),
        [cards],
    );
    const combos = useDeckCombos(advisor, playedNames, excludedIds, commander && section === "combos");
    // Both sides of every exchange, so the cuts tab has artwork for the card
    // being given up as well as the ones offered for its slot. Sorted so a
    // report that reorders the same cards does not change the query key below
    // (`names.join("\n")`) and re-run the whole lookup for nothing.
    const suggestionNames = useMemo(
        () =>
            swaps.data === null
                ? []
                : [
                      ...new Set([
                          ...swaps.data.suggestions.suggestions.map((s) => s.name),
                          ...swaps.data.swaps.map((swap) => swap.cut.name),
                      ]),
                  ].sort(),
        // `swaps` is a fresh object literal every render (see useGraphQuery's
        // return) — the dependency has to be the data itself, or this never
        // caches.
        [swaps.data],
    );
    const {
        cards: suggestionCards,
        state: suggestionCardsState,
        retry: retrySuggestionCards,
    } = useSuggestionCards(suggestionNames);

    // The service will not offer a card the deck now holds; mirrored locally
    // so an accepted card leaves the adds gallery before the next report
    // arrives, rather than sitting there for the seconds a swaps request
    // takes. The unfiltered `swaps.data.suggestions` still goes to the radar
    // batch below, so the tiles that remain do not change shape because a
    // peer left the screen.
    const visibleSuggestions = useMemo(
        () => (swaps.data === null ? null : filterReport(swaps.data.suggestions, accepted)),
        [swaps.data, accepted],
    );
    // Same trick on the cuts tab: a kept or already-cut row leaves the list
    // the moment the click lands rather than waiting on the graph.
    const visibleSwaps = useMemo(
        () => (swaps.data === null ? [] : filterSwaps(swaps.data.swaps, accepted, cards)),
        [swaps.data, accepted, cards],
    );

    // What the advice is standing on, in the order it matters: what it is
    // graded at first, then whatever the reader has changed. Said on the
    // control rather than in four banners above the panels — the assumption
    // still has to be visible, it just does not need a third of the page.
    const assumptions = [
        deck.bracket == null
            ? t("label.assumed-bracket", { number: Math.round(speed * 4) + 1 })
            : t("label.bracket", { number: deck.bracket }),
        ...(houseRules.length > 0 ? [t("label.house-rules", { count: houseRules.length })] : []),
        ...(poolQuery === null ? [] : [t("label.pool-restricted")]),
        ...(ignored.length > 0 ? [t("label.ignored-count", { count: ignored.length })] : []),
    ];

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
     * Wrapped in `useCallback`: this is handed to every tile in the gallery as
     * `onAdd`, and each tile is memoized against its props — a fresh function
     * here on every render of this whole page (busyOracle flips included)
     * would invalidate that memo for all ~45 of them instead of just the one
     * being clicked.
     */
    const add = useCallback(
        async (suggestion: Suggestion) => {
            const printing = suggestionCards.get(suggestion.name);
            if (printing === undefined) return;
            setBusyOracle(suggestion.oracle_id);
            try {
                await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone: "Main" });
                notify.success(t("toast.card-added", { name: suggestion.name }));
                // Before the invalidate, so the refetch it triggers already
                // knows not to offer this card straight back as a cut.
                defend(suggestion.oracle_id);
                // Cleared here rather than after the invalidate: the busy
                // marker is only guarding the POST against a double-click,
                // and holding it through the loader refetch — which can take
                // seconds — would leave every other tile disabled for no
                // reason. The next card can be picked while this one's
                // report catches up.
                setBusyOracle(null);
                await router.invalidate();
            } finally {
                // Safety net for the early return above and for a failed
                // add; never double-clears on the happy path, it is already
                // null there.
                setBusyOracle(null);
            }
        },
        [suggestionCards, deckUuid, t, router],
    );

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

    /**
     * Records what the deck is *played* for, as the builder says it.
     *
     * Replaces the pinned set outright rather than merging: the dialog opens
     * on the current pins and hands back the whole answer, so a theme the
     * user unticked is meant to be gone. Exclusions are left alone — they are
     * the other half of the same conversation and the dialog never asked
     * about them.
     *
     * @param themes the themes the deck plays
     */
    function defineThemes(themes: Array<string>) {
        const next = {
            pinned: [...new Set(themes)],
            excluded: themePrefs.excluded.filter((id) => !themes.includes(id)),
        };
        setThemePrefs(next);
        writeThemePrefs(deckUuid, next);
    }

    /*
     * Names for themes the deck does not read as, so an excluded one keeps its
     * proper label on the chip that undoes it. Both sources are needed and
     * neither is enough: `off_theme` carries the label while the theme is
     * still being offered, `excluded` once the offer has been taken.
     */
    const themeLabels = useMemo(
        () =>
            Object.fromEntries(
                [
                    ...(swaps.data?.suggestions.off_theme ?? []).map((lean) => [lean.theme, lean.label]),
                    ...(swaps.data?.suggestions.excluded ?? []).map((focus) => [focus.value, focus.label]),
                ].filter(([, label]) => label !== undefined && label !== ""),
            ),
        [swaps.data],
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
     * Records what this deck is measured against, and remembers it.
     *
     * One writer for every target edit: the corridors and the curve are the
     * same preference and are read back together, so a handler that wrote
     * only its own half would drop the other on the next render.
     *
     * @param next what the deck should be graded against
     */
    function applyTargets(next: DeckTargets) {
        setTargets(next);
        writeTargets(deckUuid, next);
    }

    /**
     * Narrows the pool every suggestion is drawn from, or opens it again.
     *
     * Only ever called with a query the service has already agreed compiles —
     * the control holds an unparseable one back — so this records a working
     * restriction rather than hoping the next request likes it.
     *
     * @param query the restriction, or null to search the whole pool
     */
    function applyPoolQuery(query: string | null) {
        setPoolQuery(query);
        writePoolQuery(deckUuid, query);
    }

    /**
     * Lets an ignored card back in
     *
     * Wrapped in `useCallback` and declared before {@link ignore} below, which
     * closes over it: both are handed to the adds gallery (`ignore` as
     * `onIgnore`) whose tiles are memoized against their props, so a fresh
     * function here on every render would invalidate that memo for every
     * tile, not just the one that changed.
     *
     * @param card the card to allow again
     */
    const unignore = useCallback(
        (card: IgnoredCard) => {
            const next = ignored.filter((held) => held.oracle_id !== card.oracle_id);
            setIgnored(next);
            writeIgnored(deckUuid, next);
        },
        [ignored, deckUuid],
    );

    /**
     * Rules a card out for good — the advisor never offers it again.
     *
     * Takes the pair rather than a whole suggestion: the same button sits on
     * the adds list and on every card offered for a freed slot, and the two
     * sides of the page name a card in different shapes.
     *
     * See {@link unignore} on why this is a `useCallback`.
     *
     * @param suggestion the turned-down card
     */
    const ignore = useCallback(
        (suggestion: IgnoredCard) => {
            if (ignored.some((held) => held.oracle_id === suggestion.oracle_id)) return;
            const next = [...ignored, { oracle_id: suggestion.oracle_id, name: suggestion.name }];
            setIgnored(next);
            writeIgnored(deckUuid, next);
            // Said and undoable: the eye sits beside the plus, and without
            // this a misclick silently suppresses a card for good — the list
            // simply rebuilds a moment later with no account of why.
            notify.success(t("toast.card-ignored", { name: suggestion.name }), {
                onClick: () => unignore({ oracle_id: suggestion.oracle_id, name: suggestion.name }),
            });
        },
        [ignored, deckUuid, t, unignore],
    );

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
     * one is not: when the removal fails after the add landed, the catch
     * below takes the added copy back out, so a failed swap leaves the deck
     * exactly as it was. If that rollback fails too, the deck really is
     * holding a copy it did not ask for, and the toast says so instead of
     * claiming otherwise — the user cannot fix what they are not told about.
     *
     * @param going the card being given up
     * @param add the card taking its slot
     */
    async function swap(going: CutCandidate, add: SwapAdd) {
        const printing = suggestionCards.get(add.name);
        if (printing === undefined) return;
        // The Main zone only, deliberately: the commanders ride the `keep` list
        // into every request, so the service never offers one as a cut, and a
        // deck that fields several is no exception.
        const slot = cards.find((held) => held.zone === "Main" && held.card?.oracle_id === going.oracle_id);
        if (slot === undefined) {
            notify.error(t("toast.cut-not-in-deck"));
            return;
        }
        setBusyOracle(going.oracle_id);
        try {
            const added = await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone: "Main" });
            try {
                await removeSlot(slot);
            } catch (error) {
                if (isRedirect(error)) throw error; // a 401 must still land on /auth/login
                // The remove failed after the add landed: take the added copy back out,
                // so a failed swap leaves the deck exactly as it was.
                let restored = true;
                try {
                    await removeSlot(added);
                } catch (rollbackError) {
                    if (isRedirect(rollbackError)) throw rollbackError;
                    restored = false;
                }
                notify.error(restored ? t("toast.swap-failed") : t("toast.swap-stranded", { name: add.name }));
                await router.invalidate();
                return;
            }
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
        // Main-zone only, like {@link swap}: a card in the command zone is
        // never a cut candidate, so a copy found there is not the copy meant.
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
        // Once for the whole page: a reader with the OS "reduce motion"
        // setting on gets opacity-only transitions everywhere below —
        // the gallery's slide-to-position included — rather than every
        // motion component having to be told individually.
        //
        // The transition replaces motion's default spring, which overshoots.
        // A wobble is fine on a one-off flourish; here every accepted card
        // reshuffles the whole gallery, so the tiles were bouncing more or
        // less continuously. Bounce zero keeps the slide and drops the wobble.
        <MotionConfig reducedMotion={"user"} transition={{ type: "spring", duration: 0.3, bounce: 0 }}>
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
                    <div className={"flex min-w-0 flex-wrap items-center gap-3"}>
                        {/* One control for everything the advice stands on. The
                        label is the summary — what it is graded at, and
                        whatever else is in effect — so nothing has to be
                        opened to learn that something was assumed. */}
                        <QuietButton onClick={() => setShowingAssumptions(true)} className={"max-w-full"}>
                            <AdjustmentsHorizontalIcon className={"size-3.5 shrink-0"} />
                            <span className={"truncate"}>{assumptions.join(" · ")}</span>
                        </QuietButton>
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
                        targets={targets}
                        onSetCorridor={(bucket: string, corridor: Corridor) =>
                            applyTargets(withCorridor(targets, bucket, corridor))
                        }
                        onResetCorridor={(bucket: string) => applyTargets(withoutCorridor(targets, bucket))}
                        onSetCurve={(counts: Array<number>) => applyTargets(withCurve(targets, counts))}
                        onResetCurve={() => applyTargets(withoutCurve(targets))}
                        onResetTargets={() => applyTargets(DEFAULT_TARGETS)}
                        themePrefs={themePrefs}
                        onCycleTheme={cycleThemePref}
                        onDefineThemes={defineThemes}
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
                {section === "adds" && swaps.data !== null && visibleSuggestions !== null && (
                    // No panel around the gallery: every tile carries its own
                    // surface, and a card inside a card reads as a mistake.
                    // `relative` anchors the floating updating pill — kept out
                    // of the flow so its coming and going moves nothing.
                    <div aria-busy={swaps.stale} className={"relative"}>
                        {swaps.stale && <DeckAdvisorUpdating />}
                        <DeckAdvisorSuggestions
                            report={visibleSuggestions}
                            // The radar batch stays the full, unfiltered answer —
                            // see the comment on `visibleSuggestions` above.
                            batch={swaps.data.suggestions.suggestions}
                            cards={suggestionCards}
                            cardsState={suggestionCardsState}
                            onRetryCards={retrySuggestionCards}
                            // Passed directly, not wrapped: `add` is already
                            // suggestion-typed and stable (see its own comment) —
                            // an inline wrapper here would recreate a new
                            // function every render and undo that stability.
                            onAdd={add}
                            onIgnore={ignore}
                            busyOracle={busyOracle}
                        />
                    </div>
                )}
                {section === "cuts" && swaps.data !== null && (
                    <div aria-busy={swaps.stale} className={"relative"}>
                        {swaps.stale && <DeckAdvisorUpdating />}
                        <DeckAdvisorCuts
                            swaps={visibleSwaps}
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
                    poolQuery={poolQuery}
                    targets={targets}
                    onFilled={() => void router.invalidate()}
                />

                <DeckAdvisorAssumptions
                    open={showingAssumptions}
                    onClose={() => setShowingAssumptions(false)}
                    bracket={deck.bracket ?? Math.round(speed * 4) + 1}
                    claimed={deck.bracket != null}
                    brackets={brackets}
                    houseRules={houseRules}
                    poolQuery={poolQuery}
                    onApplyPool={applyPoolQuery}
                    ignored={ignored}
                    onUnignore={unignore}
                />
            </div>
        </MotionConfig>
    );
}
