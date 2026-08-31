import { createFileRoute, isRedirect, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { EmptyState, notify } from "components";
import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckCardResponse } from "src/api/generated";
import { CutCandidate, Suggestion } from "src/api/graph-generated";
import { DeckAdvisorCuts } from "src/components/deck-advisor-cuts";
import { DeckAdvisorDoneDialog } from "src/components/deck-advisor-done-dialog";
import type { SwapAdd } from "src/components/deck-advisor-cuts";
import { DeckAdvisorAssumptions } from "src/components/deck-advisor-assumptions";
import { DeckAdvisorAutofillBanner } from "src/components/deck-advisor-autofill-banner";
import { DeckAdvisorCockpit } from "src/components/deck-advisor-cockpit";
import { DeckAdvisorOffTheme } from "src/components/deck-advisor-off-theme";
import { DeckAdvisorPhaseHeadline } from "src/components/deck-advisor-phase-headline";
import { DeckAdvisorPhaseSwitch } from "src/components/deck-advisor-phase-switch";
import { DeckAdvisorSetup } from "src/components/deck-advisor-setup";
import { DeckAdvisorSetupBanner } from "src/components/deck-advisor-setup-banner";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorSuggestions } from "src/components/deck-advisor-suggestions";
import { DeckAdvisorUpdating } from "src/components/deck-advisor-updating";
import { DeckFillDialog } from "src/components/deck-fill-dialog";
import { effectiveManaValue } from "src/utils/commander";
import { IgnoredCard, KeptCard, cycleTheme, pruneThemePrefs } from "src/utils/advisor-settings";
import { advisorDeck, bracketSpeed, filterReport, filterSwaps, suggestionAddQuantity } from "src/utils/deck-advisor";
import { deckArt } from "src/utils/deck-art";
import {
    DEFAULT_TARGETS,
    DeckTargets,
    isDefault,
    withCorridor,
    withCurve,
    withTypeCorridor,
    withoutCorridor,
    withoutCurve,
    withoutTypeCorridor,
} from "src/utils/deck-targets";
import { commanderColors, deckRuleZero, houseRulesSummary } from "src/utils/deck-rules";
import { useAdvisorSettings } from "src/utils/use-advisor-settings";
import { useDeckAnalysis } from "src/utils/use-deck-analysis";
import { useDeckSwaps } from "src/utils/use-deck-swaps";
import { useEdhrecWarm } from "src/utils/use-edhrec-warm";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/** The advisor's phases: trim (over target), build (under target), refine (at target) */
export type AdvisorPhase = "trim" | "build" | "refine";

/** Under this many cards a deck has nothing to detect from, so the advisor asks instead */
const FRESH_DECK_CARDS = 20;

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/advisor")({
    validateSearch: (search: Record<string, unknown>): { phase?: AdvisorPhase } => ({
        phase:
            search.phase === "trim" || search.phase === "build" || search.phase === "refine" ? search.phase : undefined,
    }),
    loader: ({ params }) => Api.decks.cards.list(params.deckUuid),
    component: RouteComponent,
});

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
    const { phase: explicitPhase } = Route.useSearch();
    const { cards } = Route.useLoaderData();
    const { deck, formats, brackets } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("advisor");
    const router = useRouter();
    const navigate = useNavigate({ from: Route.fullPath });
    const lastCount = useRef<number | null>(null);
    const [busyOracle, setBusyOracle] = useState<string | null>(null);
    // Everything the advisor knows about this deck for this reader — which
    // themes it argues for, the shape it grades against, what a card may
    // cost, and the two lists of cards it has been told to leave alone. One
    // document on the server, replaced whole by every writer below.
    const { settings, ready, save } = useAdvisorSettings(deckUuid);
    // The cards that are not up for discussion this session: the ones the
    // advisor talked the user into.
    //
    // Not persisted, and deliberately: it exists to stop the tool contradicting
    // its own advice one click later, not to make a card permanently uncuttable.
    // A deck reopened tomorrow is a fresh judgement, and by then the card has
    // had a chance to earn its slot on the same terms as everything else.
    const [accepted, setAccepted] = useState<Array<string>>([]);
    const [filling, setFilling] = useState(false);
    const [showingAssumptions, setShowingAssumptions] = useState(false);
    const [showingDone, setShowingDone] = useState(false);
    const [showingSetup, setShowingSetup] = useState(false);
    // Which deck the auto-open decision below has already been made for —
    // set once per (deck, settings-arrived) pair, never recomputed on a
    // later render, or closing the dialog by hand would reopen it a moment
    // later as something else on the page re-renders.
    const setupDecided = useRef<string | null>(null);

    // "Keep" and "Kept" ride the server-held settings now (see `settings`
    // above); only the session-only accepted list still needs resetting on a
    // switch to another deck — the route component survives that switch.
    useEffect(() => {
        setAccepted([]);
        setShowingSetup(false);
        setupDecided.current = null;
    }, [deckUuid]);

    const rules = formats.find((format) => format.slug === deck.format);
    // What the deck is actually built to, the commanders counted in — the
    // agreed size when the table set one, the format's number otherwise, read
    // exactly the way `checkDeck` reads it. The projection turns it into the
    // number the graph means by "deck size".
    const target = deckRuleZero(deck).deckSize ?? rules?.deck_size.cards ?? null;
    // Main + Commander only — mirrors checkDeck's own sum (deck-rules.ts:314-318).
    // Not shared as a helper: three lines, one call site on each side.
    const cardCount = useMemo(
        () =>
            cards
                .filter((slot) => slot.zone === "Main" || slot.zone === "Commander")
                .reduce((sum, slot) => sum + slot.quantity, 0),
        [cards],
    );
    // A deck nobody has been asked about yet either gets the setup dialog on
    // sight, under FRESH_DECK_CARDS, or the quiet banner otherwise — never
    // both, and never more than once per visit. Waits on `ready` for the
    // same reason every graph query here does: deciding off the defaults
    // would be deciding wrong, if only for the render before the truth
    // arrives.
    useEffect(() => {
        if (!ready || setupDecided.current === deckUuid) return;
        setupDecided.current = deckUuid;
        if (!settings.setup_done && cardCount < FRESH_DECK_CARDS) setShowingSetup(true);
    }, [ready, deckUuid, settings.setup_done, cardCount]);
    // target is only ever null for a format with no fixed/claimed size, which
    // cannot happen here — advisor is commander-only and Commander always resolves
    // to 100 or a Rule Zero override. Falls back to "build" rather than crashing.
    const autoPhase: AdvisorPhase =
        target === null ? "build" : cardCount === target ? "refine" : cardCount > target ? "trim" : "build";
    const phase = explicitPhase ?? autoPhase;
    // Edge-triggered: fires only on the render where the count *becomes* the
    // target, from either direction, not on every render where it happens to
    // already be there (a page load already at 100 should not celebrate).
    useEffect(() => {
        if (target !== null && lastCount.current !== null && lastCount.current !== target && cardCount === target) {
            setShowingDone(true);
        }
        lastCount.current = cardCount;
    }, [cardCount, target]);
    const advisor = useMemo(
        () => advisorDeck(cards, { allowedColorIdentity: deck.allowed_color_identity, targetSize: target }),
        [cards, deck.allowed_color_identity, target],
    );
    // The colours the deck actually plays: its Rule-Zero claim when it makes
    // one (the projection already split that into letters), its commanders'
    // identity otherwise. Only the *count* matters here — it sets how many
    // copies one click on a suggested basic files.
    const deckColors = useMemo(
        () => advisor.identity ?? commanderColors(cards.filter((slot) => slot.zone === "Commander")),
        [advisor, cards],
    );
    // Said above the advice, because every panel below is graded against it.
    const houseRules = useMemo(() => houseRulesSummary(deck, cards, rules), [deck, cards, rules]);
    const commander = deck.format === "commander";
    // The deck's bracket, and nothing else: it is the deck's own statement
    // about how hard it plays, it sits on the chip beside the deck's name, and
    // a second dial for the same thing here only ever disagreed with it.
    const speed = bracketSpeed(deck.bracket);
    const excludedIds = useMemo(() => settings.ignored.map((card) => card.oracle_id), [settings.ignored]);
    // What the user accepted this session plus what they durably keep —
    // both ride the request's `keep` parameter. The commanders are not in
    // here: the backend is told the whole command zone and defends it itself.
    const protectedIds = useMemo(
        () => [...new Set([...accepted, ...settings.kept.map((card) => card.oracle_id)])].sort(),
        [accepted, settings.kept],
    );
    // `&& ready` on both: the graph takes targets, themes and the pool as
    // parameters, so firing before the settings answer has arrived asks the
    // graph twice — once against the defaults, once against the truth — and
    // shows a moment of advice that was never right.
    const analysis = useDeckAnalysis(advisor, speed, commander && ready, settings.targets);
    const swaps = useDeckSwaps(
        advisor,
        speed,
        excludedIds,
        settings.themes,
        protectedIds,
        settings.pool_query,
        settings.targets,
        commander && ready,
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
    // The deck's own printings, by name, so every composition count in the
    // cockpit can open onto the cards behind it without a lookup.
    const art = useMemo(() => deckArt(cards), [cards]);
    // Already parked rather than played: the loader's card list covers every
    // zone, so this is what tells a tile or dialog to say "already on the
    // maybe list" instead of offering to add it again.
    const maybeOracles = useMemo(
        () =>
            new Set(
                cards
                    .filter((held) => held.zone === "Maybe")
                    .map((held) => held.card?.oracle_id)
                    .filter((id): id is string => id != null),
            ),
        [cards],
    );
    const eminence = useMemo(() => effectiveManaValue(cards).eminence, [cards]);
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
        () => (swaps.data === null ? [] : filterSwaps(swaps.data.swaps, protectedIds, cards)),
        [swaps.data, protectedIds, cards],
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
        ...(settings.pool_query === null ? [] : [t("label.pool-restricted")]),
        // A moved corridor silences or arms whole channels — the Kess deck lost
        // every synergy_wincon suggestion to a forgotten override — so it must
        // be as visible here as the pool restriction is.
        ...(isDefault(settings.targets) ? [] : [t("label.targets-moved")]),
        ...(settings.ignored.length > 0 ? [t("label.ignored-count", { count: settings.ignored.length })] : []),
        ...(settings.kept.length > 0 ? [t("label.kept-count", { count: settings.kept.length })] : []),
    ];

    // Whether the reader has never been through the setup questions — the
    // banner's own condition, and the dialog's until the mount effect above
    // has decided whether to open it. `ready` first: deciding off the
    // defaults would tell a deck that has actually finished setup to ask
    // again.
    const needsSetup = ready && !settings.setup_done;
    // Theme id to card count, from the live analysis when there is one —
    // the one screen where a near-empty deck's builder knows something the
    // detector cannot, so the counts are mostly absent and that is the point.
    const detectedThemes = useMemo(
        () => Object.fromEntries((analysis.data?.themes ?? []).map((theme) => [theme.theme, theme.cards ?? 0])),
        [analysis.data],
    );

    /**
     * Claims a bracket for the deck itself — the one setup answer that is
     * not part of the advisor settings document, because it already has its
     * own endpoint and its own chip beside the deck's name.
     *
     * @param bracket the bracket to claim, `null` to leave it unsaid
     */
    function saveBracket(bracket: number | null) {
        void Api.decks.setBracket(deckUuid, bracket).then(() => router.invalidate());
    }

    /**
     * Switches the visible phase, with replace semantics
     *
     * @param next the phase to show
     */
    const showPhase = (next: AdvisorPhase) => {
        void navigate({ search: (prev) => ({ ...prev, phase: next }), replace: true });
    };

    /**
     * Resolves the done transition by navigating to a phase
     *
     * @param next the phase to navigate to (refine or build)
     */
    const resolveDone = (next: "refine" | "build") => {
        setShowingDone(false);
        showPhase(next);
    };

    /**
     * Marks a card as one the advisor argued for, so it stops arguing against it
     *
     * @param oracleId the card that was accepted
     */
    function defend(oracleId: string) {
        setAccepted((held) => (held.includes(oracleId) ? held : [...held, oracleId]));
    }

    /**
     * Files a suggestion into the mainboard — one copy, except a basic land,
     * which goes in as the handful {@link suggestionAddQuantity} says. A card
     * the deck already holds raises its existing slot instead of opening a
     * second row on the decklist.
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
                const quantity = suggestionAddQuantity(suggestion.type_line, deckColors.length);
                // The deck may already sleeve this card — basics especially,
                // which the advisor keeps offering past the in-deck filter.
                // Raising that slot's count keeps the list at one row per
                // card and keeps the owner's print, whatever edition the
                // catalog would have picked; only a card the deck holds
                // nowhere in the mainboard opens a new slot.
                const held = cards.find(
                    (slot) => slot.zone === "Main" && slot.card?.oracle_id === suggestion.oracle_id,
                );
                if (held === undefined) {
                    await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity, zone: "Main" });
                } else {
                    await Api.decks.cards.update(deckUuid, held.uuid, { quantity: held.quantity + quantity });
                }
                notify.success(t("toast.card-added", { name: suggestion.name, count: quantity }));
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
        [suggestionCards, deckColors, cards, deckUuid, t, router],
    );

    /**
     * Files one copy of a suggestion into the maybe zone instead of the deck.
     *
     * Deliberately no `defend()`: the card is still not in the deck, so the
     * advisor may keep arguing for it — the `maybeOracles` guard set, checked
     * here and again in every button's `disabled`, is what stops a repeat add
     * before it is sent (the backend would fold an identical print into the
     * existing slot, but the guard is also what the buttons' disabled state
     * reads). Wrapped in `useCallback` for the same reason as `add` above.
     */
    const addToMaybe = useCallback(
        async (suggestion: Suggestion) => {
            const printing = suggestionCards.get(suggestion.name);
            if (printing === undefined || maybeOracles.has(suggestion.oracle_id)) return;
            setBusyOracle(suggestion.oracle_id);
            try {
                await Api.decks.cards.add(deckUuid, { printing: printing.id, quantity: 1, zone: "Maybe" });
                notify.success(t("toast.card-maybed", { name: suggestion.name }));
                setBusyOracle(null);
                await router.invalidate();
            } finally {
                setBusyOracle(null);
            }
        },
        [suggestionCards, maybeOracles, deckUuid, t, router],
    );

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
        const cycled = cycleTheme(settings.themes, themeId);
        const next = live === undefined ? cycled : pruneThemePrefs(cycled, [...live, themeId]);
        save({ ...settings, themes: next });
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
            excluded: settings.themes.excluded.filter((id) => !themes.includes(id)),
        };
        save({ ...settings, themes: next });
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
            pinned: settings.themes.pinned.filter((id) => id !== themeId),
            excluded: [...new Set([...settings.themes.excluded, themeId])],
        };
        save({ ...settings, themes: next });
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
        save({ ...settings, targets: next });
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
        save({ ...settings, pool_query: query });
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
            const next = settings.ignored.filter((held) => held.oracle_id !== card.oracle_id);
            save({ ...settings, ignored: next });
        },
        [settings, save],
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
            if (settings.ignored.some((held) => held.oracle_id === suggestion.oracle_id)) return;
            const next = [...settings.ignored, { oracle_id: suggestion.oracle_id, name: suggestion.name }];
            save({ ...settings, ignored: next });
            // Said and undoable: the eye sits beside the plus, and without
            // this a misclick silently suppresses a card for good — the list
            // simply rebuilds a moment later with no account of why.
            notify.success(t("toast.card-ignored", { name: suggestion.name }), {
                onClick: () => unignore({ oracle_id: suggestion.oracle_id, name: suggestion.name }),
            });
        },
        [settings, save, t, unignore],
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
     * Takes a card off the table for good: the advisor stops proposing it as
     * a cut, on this device, until the owner says otherwise.
     *
     * Persisted, unlike `accepted` — "Keep" is the owner's decision about
     * the deck, not the advisor covering its own advice, and the
     * session-only version put the same card back on the cut list after
     * every rebuild. The whole exchange leaves the view with it, because
     * every add on the row was only ever offered for this card's slot. The
     * toast undoes; the assumptions dialog revokes later.
     *
     * @param candidate the card being kept
     */
    function keep(candidate: CutCandidate) {
        if (protectedIds.includes(candidate.oracle_id)) return;
        const next = [...settings.kept, { oracle_id: candidate.oracle_id, name: candidate.name }];
        save({ ...settings, kept: next });
        notify.success(t("toast.card-kept", { name: candidate.name }), {
            onClick: () => unkeep({ oracle_id: candidate.oracle_id, name: candidate.name }),
        });
    }

    /**
     * Lets a kept card back onto the cut table
     *
     * @param card the card to stop defending
     */
    function unkeep(card: KeptCard) {
        save({ ...settings, kept: settings.kept.filter((entry) => entry.oracle_id !== card.oracle_id) });
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
                <DeckAdvisorPhaseSwitch
                    phase={phase}
                    autoPhase={autoPhase}
                    onSelect={showPhase}
                    assumptions={assumptions.join(" · ")}
                    onOpenAssumptions={() => setShowingAssumptions(true)}
                    onFill={() => setFilling(true)}
                />

                {/* Under the header, above every phase: a deck with cards in
                    it already has a detector with an opinion, so this offers
                    the setup rather than interrupting for it. */}
                {needsSetup && cardCount >= FRESH_DECK_CARDS && (
                    <DeckAdvisorSetupBanner
                        onSetup={() => setShowingSetup(true)}
                        onNotNow={() => save({ ...settings, setup_done: true })}
                    />
                )}

                {/* Above the phases, not inside one: the lean is a property of
                the whole answer, and it is as true of the swaps as of the adds. */}
                {swaps.data !== null && (
                    <DeckAdvisorOffTheme leans={swaps.data.suggestions.off_theme ?? []} onExclude={excludeThemePref} />
                )}

                {swaps.data === null && <DeckAdvisorState state={swaps.state} />}

                {swaps.data !== null && phase === "trim" && (
                    <div aria-busy={swaps.stale} className={"relative flex flex-col gap-4"}>
                        {swaps.stale && <DeckAdvisorUpdating />}
                        {/* The counted headline only while the count actually argues for
                        cutting — this view is also reachable by override from at or
                        under target, where "-1 cards over" would be nonsense. */}
                        <DeckAdvisorPhaseHeadline
                            heading={
                                target !== null && cardCount > target
                                    ? t("heading.trim-headline", { count: cardCount - target })
                                    : t("heading.trim-browse")
                            }
                            description={t("description.trim")}
                        />
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
                            // Trimming means taking cards out, not trading them —
                            // a replacement per cut would grow the deck right
                            // back. The refine phase keeps the full exchanges.
                            cutsOnly={true}
                        />
                    </div>
                )}

                {swaps.data !== null && phase === "build" && visibleSuggestions !== null && (
                    <div aria-busy={swaps.stale} className={"relative flex flex-col gap-4"}>
                        {swaps.stale && <DeckAdvisorUpdating />}
                        {/* Same guard as the trim headline: "0 cards to go" is exactly
                        what the done dialog's "add a few more" path would read. */}
                        <DeckAdvisorPhaseHeadline
                            heading={
                                target !== null && cardCount < target
                                    ? t("heading.build-headline", { count: target - cardCount })
                                    : t("heading.build-browse")
                            }
                            description={t("description.build")}
                        />
                        {target !== null && cardCount < target && (
                            <DeckAdvisorAutofillBanner remaining={target - cardCount} onFill={() => setFilling(true)} />
                        )}
                        <DeckAdvisorSuggestions
                            report={visibleSuggestions}
                            batch={swaps.data.suggestions.suggestions}
                            cards={suggestionCards}
                            cardsState={suggestionCardsState}
                            onRetryCards={retrySuggestionCards}
                            onAdd={add}
                            onAddToMaybe={addToMaybe}
                            maybeOracles={maybeOracles}
                            onIgnore={ignore}
                            busyOracle={busyOracle}
                        />
                    </div>
                )}

                {swaps.data !== null && phase === "refine" && (
                    <div aria-busy={swaps.stale} className={"relative flex flex-col gap-4"}>
                        {swaps.stale && <DeckAdvisorUpdating />}
                        <DeckAdvisorPhaseHeadline
                            heading={
                                target !== null && cardCount === target
                                    ? t("heading.refine")
                                    : t("heading.refine-browse")
                            }
                            description={t("description.refine", { count: cardCount })}
                        />
                        <DeckAdvisorCockpit
                            analysis={analysis}
                            unknown={advisor.unknown}
                            targets={settings.targets}
                            onSetCurve={(counts) => applyTargets(withCurve(settings.targets, counts))}
                            onResetCurve={() => applyTargets(withoutCurve(settings.targets))}
                            onSetCorridor={(bucket, corridor) =>
                                applyTargets(withCorridor(settings.targets, bucket, corridor))
                            }
                            onResetCorridor={(bucket) => applyTargets(withoutCorridor(settings.targets, bucket))}
                            onSetTypeCorridor={(type, corridor) =>
                                applyTargets(withTypeCorridor(settings.targets, type, corridor))
                            }
                            onResetTypeCorridor={(type) => applyTargets(withoutTypeCorridor(settings.targets, type))}
                            onResetTargets={() => applyTargets(DEFAULT_TARGETS)}
                            eminence={eminence}
                            themePrefs={settings.themes}
                            onCycleTheme={cycleThemePref}
                            onDefineThemes={defineThemes}
                            themeLabels={themeLabels}
                            art={art}
                        />
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

                <DeckFillDialog
                    open={filling}
                    onClose={() => setFilling(false)}
                    deckUuid={deckUuid}
                    deck={advisor}
                    speed={speed}
                    excluded={excludedIds}
                    themes={settings.themes}
                    poolQuery={settings.pool_query}
                    targets={settings.targets}
                    onFilled={() => void router.invalidate()}
                />

                <DeckAdvisorAssumptions
                    open={showingAssumptions}
                    onClose={() => setShowingAssumptions(false)}
                    bracket={deck.bracket ?? Math.round(speed * 4) + 1}
                    claimed={deck.bracket != null}
                    brackets={brackets}
                    houseRules={houseRules}
                    poolQuery={settings.pool_query}
                    onApplyPool={applyPoolQuery}
                    ignored={settings.ignored}
                    onUnignore={unignore}
                    kept={settings.kept}
                    onUnkeep={unkeep}
                />

                <DeckAdvisorDoneDialog
                    open={showingDone}
                    count={cardCount}
                    onClose={() => setShowingDone(false)}
                    onRefine={() => resolveDone("refine")}
                    onAddMore={() => resolveDone("build")}
                />

                <DeckAdvisorSetup
                    open={showingSetup}
                    onClose={() => setShowingSetup(false)}
                    deck={deck}
                    brackets={brackets}
                    settings={settings}
                    onSave={save}
                    onSaveBracket={saveBracket}
                    detected={detectedThemes}
                />
            </div>
        </MotionConfig>
    );
}
