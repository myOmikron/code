import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { Button, EmptyState, notify } from "components";
import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckCardResponse } from "src/api/generated";
import { CutCandidate, Suggestion } from "src/api/graph-generated";
import { ChartPanel } from "src/components/charts/chart-card";
import { DeckAdvisorCockpit, DeckAdvisorCockpitProps } from "src/components/deck-advisor-cockpit";
import { DeckAdvisorConsistency } from "src/components/deck-advisor-consistency";
import { DeckAdvisorDebriefDialog } from "src/components/deck-advisor-debrief-dialog";
import { DeckAdvisorGoals, GoalsTab } from "src/components/deck-advisor-goals";
import { DeckAdvisorHeader } from "src/components/deck-advisor-header";
import { DeckAdvisorInteractionGrid } from "src/components/deck-advisor-interaction-grid";
import { DeckAdvisorLines } from "src/components/deck-advisor-lines";
import { DeckAdvisorMoves } from "src/components/deck-advisor-moves";
import { DeckAdvisorNeeds } from "src/components/deck-advisor-needs";
import { DeckAdvisorOffTheme } from "src/components/deck-advisor-off-theme";
import { DeckAdvisorPlateauDialog } from "src/components/deck-advisor-plateau-dialog";
import { DeckAdvisorRoomDialog } from "src/components/deck-advisor-room-dialog";
import { DeckAdvisorSetup, shapeCurve } from "src/components/deck-advisor-setup";
import { DeckAdvisorSetupBanner } from "src/components/deck-advisor-setup-banner";
import { DeckAdvisorShapeSummary } from "src/components/deck-advisor-shape-summary";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorUpdating } from "src/components/deck-advisor-updating";
import { DeckFillDialog } from "src/components/deck-fill-dialog";
import { dimLabel } from "src/components/deck-advisor-impact-badges";
import { Direction, fixOf, shiftTargets } from "src/utils/advisor-directions";
import { deckDims, needs, plateaued, roomFor } from "src/utils/advisor-impact";
import { Move, buildMoves, rankedAdds } from "src/utils/advisor-moves";
import { say, sayWhy } from "src/utils/advisor-phrase";
import { IgnoredCard, KeptCard, ThemeLevel, withThemeLevel } from "src/utils/advisor-settings";
import { effectiveManaValue } from "src/utils/commander";
import { defaultFoil } from "src/utils/default-finish";
import {
    ADVISOR_MAX_CARDS,
    advisorAccepts,
    advisorDeck,
    bracketSpeed,
    filterCuts,
    filterReport,
    playedNames,
    suggestionAddQuantity,
} from "src/utils/deck-advisor";
import { deckArt } from "src/utils/deck-art";
import { commanderColors, countBracket, deckRuleZero, detectedBracket, houseRulesSummary } from "src/utils/deck-rules";
import {
    DEFAULT_TARGETS,
    DeckTargets,
    curveCounts,
    isDefault,
    withCorridor,
    withCurve,
    withTypeCorridor,
    withoutCorridor,
    withoutCurve,
    withoutTypeCorridor,
} from "src/utils/deck-targets";
import { themeListing } from "src/utils/deck-theme-read";
import { useAdvisorSettings } from "src/utils/use-advisor-settings";
import { useBracketClaim } from "src/utils/use-bracket-claim";
import { useBracketMarks } from "src/utils/use-bracket-marks";
import { useDeckAnalysis } from "src/utils/use-deck-analysis";
import { useDeckCombos } from "src/utils/use-deck-combos";
import { cedhCockpitApplies, useDeckLines } from "src/utils/use-deck-lines";
import { useDeckSwaps } from "src/utils/use-deck-swaps";
import { useEdhrecWarm } from "src/utils/use-edhrec-warm";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/** Under this many cards a deck has nothing to detect from, so the advisor asks instead */
const FRESH_DECK_CARDS = 20;

/** How long after "play it first" the advisor asks how it went */
const DEBRIEF_AFTER_DAYS = 3;

/** How long "not now" puts the question off */
const DEBRIEF_SNOOZE_DAYS = 1;

/** The cut reasons that argue for letting a card go, worded as its one fact */
const ARGUES_OUT = new Set(["bucket-crowded", "excluded-theme", "improves-shape", "rarely-played", "stranded"]);

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/advisor")({
    loader: ({ params }) => Api.decks.cards.list(params.deckUuid),
    component: RouteComponent,
});

/**
 * A date some days from now, as the settings document stores it
 *
 * @param days how many days ahead
 *
 * @returns the ISO timestamp
 */
function daysFromNow(days: number): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The deck advisor: one gallery of moves under one read of the deck's shape.
 * The card count decides whether a move adds, cuts or swaps; the screen stays
 * the same.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { cards } = Route.useLoaderData();
    const { deck, formats, brackets } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("advisor");
    const [tg] = useTranslation();
    const router = useRouter();
    const [busyOracle, setBusyOracle] = useState<string | null>(null);
    const { settings, ready, save } = useAdvisorSettings(deckUuid);
    const [accepted, setAccepted] = useState<Array<string>>([]);
    const [filling, setFilling] = useState(false);
    const [goalsTab, setGoalsTab] = useState<GoalsTab | null>(null);
    const [showingSetup, setShowingSetup] = useState(false);
    const [makingRoom, setMakingRoom] = useState<Suggestion | null>(null);
    const [filter, setFilter] = useState<string | null>(null);
    const [plateauOpen, setPlateauOpen] = useState(false);
    const [debriefOpen, setDebriefOpen] = useState(false);
    const setupDecided = useRef<string | null>(null);
    const plateauDecided = useRef<string | null>(null);
    const debriefDecided = useRef<string | null>(null);

    useEffect(() => {
        setAccepted([]);
        setShowingSetup(false);
        setFilter(null);
        setupDecided.current = null;
        plateauDecided.current = null;
        debriefDecided.current = null;
    }, [deckUuid]);

    const rules = formats.find((format) => format.slug === deck.format);
    const target = deckRuleZero(deck).deckSize ?? rules?.deck_size.cards ?? null;
    const cardCount = useMemo(
        () =>
            cards
                .filter((slot) => slot.zone === "Main" || slot.zone === "Commander")
                .reduce((sum, slot) => sum + slot.quantity, 0),
        [cards],
    );
    const diff = target === null ? -1 : cardCount - target;

    useEffect(() => {
        if (!ready || setupDecided.current === deckUuid) return;
        setupDecided.current = deckUuid;
        if (!settings.setup_done && cardCount < FRESH_DECK_CARDS) setShowingSetup(true);
    }, [ready, deckUuid, settings.setup_done, cardCount]);

    useEffect(() => {
        if (!ready || debriefDecided.current === deckUuid) return;
        debriefDecided.current = deckUuid;
        if (settings.debrief_at !== null && Date.parse(settings.debrief_at) <= Date.now()) setDebriefOpen(true);
    }, [ready, deckUuid, settings.debrief_at]);

    const advisor = useMemo(
        () => advisorDeck(cards, { allowedColorIdentity: deck.allowed_color_identity, targetSize: target }),
        [cards, deck.allowed_color_identity, target],
    );
    const deckColors = useMemo(
        () => advisor.identity ?? commanderColors(cards.filter((slot) => slot.zone === "Commander")),
        [advisor, cards],
    );
    const houseRules = useMemo(() => houseRulesSummary(deck, cards, rules), [deck, cards, rules]);
    const commander = deck.format === "commander";
    const tooLarge = !advisorAccepts(advisor);
    const readable = commander && ready;
    const speed = bracketSpeed(deck.bracket);
    const played = useMemo(() => playedNames(cards), [cards]);
    const combos = useDeckCombos(advisor, played, [], commander);
    const bracketCounts = useMemo(
        () =>
            countBracket(
                cards,
                combos.data === null || combos.stale ? null : combos.data.complete.map((combo) => combo.card_names),
            ),
        [cards, combos.data, combos.stale],
    );
    const claimedRules = brackets.find((entry) => entry.number === deck.bracket);
    useBracketClaim(
        deckUuid,
        deck.bracket ?? null,
        cardCount,
        target,
        bracketCounts.combos === null ? null : detectedBracket(bracketCounts, brackets),
        (bracket) => {
            saveBracket(bracket);
            notify.success(tg("toast.bracket-detected", { number: bracket }));
        },
    );
    const excludedIds = useMemo(() => settings.ignored.map((card) => card.oracle_id), [settings.ignored]);
    const protectedIds = useMemo(
        () => [...new Set([...accepted, ...settings.kept.map((card) => card.oracle_id)])].sort(),
        [accepted, settings.kept],
    );
    const analysis = useDeckAnalysis(advisor, speed, readable, settings.targets);
    const cedh = cedhCockpitApplies(speed);
    const lines = useDeckLines(advisor, speed, excludedIds, readable);
    const swaps = useDeckSwaps(
        advisor,
        speed,
        excludedIds,
        settings.themes,
        protectedIds,
        settings.pool_query,
        settings.targets,
        readable,
    );
    const edhrecPending = useMemo(
        () => (swaps.data?.suggestions.notes ?? []).some((note) => note.code === "edhrec-pending"),
        [swaps.data],
    );
    useEdhrecWarm(advisor.commanders, edhrecPending);
    const art = useMemo(() => deckArt(cards), [cards]);
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

    const report = analysis.data;
    const themeLabels = useMemo(
        () =>
            Object.fromEntries(
                [
                    ...(report?.themes ?? []).map((theme) => [theme.theme, theme.label]),
                    ...(swaps.data?.suggestions.off_theme ?? []).map((lean) => [lean.theme, lean.label]),
                    ...(swaps.data?.suggestions.excluded ?? []).map((focus) => [focus.value, focus.label]),
                ].filter(([, label]) => label !== undefined && label !== ""),
            ) as Record<string, string>,
        [report, swaps.data],
    );
    const dims = useMemo(() => {
        if (report === null) return [];
        const spells = Math.max(0, report.deck_size - report.lands);
        const listed = themeListing(report, settings.themes, themeLabels).listed.map((row) => row.id);
        return deckDims(report, settings.themes, listed, curveCounts(settings.targets, spells));
    }, [report, settings.themes, settings.targets, themeLabels]);
    const deckNeeds = useMemo(() => needs(dims), [dims]);

    const adds = useMemo(
        () => (swaps.data === null ? [] : rankedAdds(filterReport(swaps.data.suggestions, accepted), cedh)),
        [swaps.data, accepted, cedh],
    );
    const cuts = useMemo(
        () => (swaps.data === null ? [] : filterCuts(swaps.data.cuts, protectedIds, cards)),
        [swaps.data, protectedIds, cards],
    );
    const roomCuts = useMemo(() => {
        if (swaps.data === null) return [];
        const all = [...swaps.data.cuts, ...swaps.data.swaps.map((swap) => swap.cut)];
        const unique = all.filter(
            (cut, index) => all.findIndex((other) => other.oracle_id === cut.oracle_id) === index,
        );
        return filterCuts(unique, protectedIds, cards);
    }, [swaps.data, protectedIds, cards]);
    const facts = useMemo(() => {
        const out: Record<string, string> = {};
        for (const add of adds) {
            const best = add.provenance
                .filter((entry) => entry.score > 0)
                .reduce<(typeof add.provenance)[number] | undefined>(
                    (held, entry) => (held === undefined || entry.score > held.score ? entry : held),
                    undefined,
                );
            out[add.oracle_id] = best === undefined ? "" : sayWhy(t, best);
        }
        for (const cut of roomCuts) {
            const reason = cut.reasons?.find((entry) => ARGUES_OUT.has(entry.code)) ?? cut.reasons?.[0];
            out[cut.oracle_id] = reason === undefined ? "" : say(t, "cut", reason);
        }
        return out;
    }, [adds, roomCuts, t]);
    const moves = useMemo(
        () => buildMoves({ diff, adds, cuts: diff === 0 ? roomCuts : cuts, dims, facts, filter }),
        [diff, adds, cuts, roomCuts, dims, facts, filter],
    );
    const roomOptions = useMemo(
        () => (makingRoom === null ? [] : roomFor(makingRoom, roomCuts, dims)),
        [makingRoom, roomCuts, dims],
    );
    const done = useMemo(
        () =>
            diff === 0 &&
            report !== null &&
            swaps.data !== null &&
            !swaps.stale &&
            !analysis.stale &&
            plateaued(adds, roomCuts, dims),
        [diff, report, swaps.data, swaps.stale, analysis.stale, adds, roomCuts, dims],
    );

    useEffect(() => {
        if (!done || plateauDecided.current === deckUuid || settings.debrief_at !== null || debriefOpen) return;
        plateauDecided.current = deckUuid;
        setPlateauOpen(true);
    }, [done, deckUuid, settings.debrief_at, debriefOpen]);

    const suggestionNames = useMemo(
        () =>
            swaps.data === null
                ? []
                : [
                      ...new Set([
                          ...swaps.data.suggestions.suggestions.map((s) => s.name),
                          ...swaps.data.cuts.map((cut) => cut.name),
                          ...swaps.data.swaps.map((swap) => swap.cut.name),
                      ]),
                  ].sort(),
        [swaps.data],
    );
    const {
        cards: suggestionCards,
        state: suggestionCardsState,
        retry: retrySuggestionCards,
    } = useSuggestionCards(suggestionNames);
    const suggestionCandidates = useMemo(
        () => [...suggestionCards].map(([name, printing]) => ({ name, printing: printing.id })),
        [suggestionCards],
    );
    const marks = useBracketMarks(bracketCounts, claimedRules, suggestionCandidates);

    const goalsLine = [
        t("label.goals"),
        ...settings.directions.map((direction) => {
            const fix = fixOf(direction);
            return fix === undefined ? "" : t(`label.fix-${fix.id}`);
        }),
        deck.bracket == null
            ? t("label.assumed-bracket", { number: Math.round(speed * 4) + 1 })
            : t("label.bracket", { number: deck.bracket }),
        ...(houseRules.length > 0 ? [t("label.house-rules", { count: houseRules.length })] : []),
        ...(settings.pool_query === null ? [] : [t("label.pool-restricted")]),
        ...(isDefault(settings.targets) || settings.directions.length > 0 ? [] : [t("label.targets-moved")]),
        ...(settings.ignored.length > 0 ? [t("label.ignored-count", { count: settings.ignored.length })] : []),
        ...(settings.kept.length > 0 ? [t("label.kept-count", { count: settings.kept.length })] : []),
    ]
        .filter((part) => part !== "")
        .join(" · ");

    const needsSetup = ready && !settings.setup_done;
    const detectedThemes = useMemo(
        () => Object.fromEntries((report?.themes ?? []).map((theme) => [theme.theme, theme.cards ?? 0])),
        [report],
    );

    /**
     * Claims a bracket for the deck itself
     *
     * @param bracket the bracket to claim, `null` to leave it unsaid
     */
    function saveBracket(bracket: number | null) {
        void Api.decks.setBracket(deckUuid, bracket).then(() => router.invalidate());
    }

    /**
     * Marks a card as one the advisor argued for, so it stops arguing against it
     *
     * @param oracleId the card that was accepted
     */
    function defend(oracleId: string) {
        setAccepted((held) => (held.includes(oracleId) ? held : [...held, oracleId]));
    }

    const add = useCallback(
        async (suggestion: Suggestion) => {
            const printing = suggestionCards.get(suggestion.name);
            if (printing === undefined) return;
            setBusyOracle(suggestion.oracle_id);
            try {
                const quantity = suggestionAddQuantity(suggestion.type_line, deckColors.length);
                const held = cards.find(
                    (slot) => slot.zone === "Main" && slot.card?.oracle_id === suggestion.oracle_id,
                );
                if (held === undefined) {
                    await Api.decks.cards.add(deckUuid, {
                        printing: printing.id,
                        quantity,
                        zone: "Main",
                        foil: defaultFoil(printing.finishes),
                    });
                } else {
                    await Api.decks.cards.update(deckUuid, held.uuid, { quantity: held.quantity + quantity });
                }
                notify.success(t("toast.card-added", { name: suggestion.name, count: quantity }));
                defend(suggestion.oracle_id);
                setBusyOracle(null);
                await router.invalidate();
            } finally {
                setBusyOracle(null);
            }
        },
        [suggestionCards, deckColors, cards, deckUuid, t, router],
    );

    const addToMaybe = useCallback(
        async (suggestion: Suggestion) => {
            const printing = suggestionCards.get(suggestion.name);
            if (printing === undefined || maybeOracles.has(suggestion.oracle_id)) return;
            setBusyOracle(suggestion.oracle_id);
            try {
                await Api.decks.cards.add(deckUuid, {
                    printing: printing.id,
                    quantity: 1,
                    zone: "Maybe",
                    foil: defaultFoil(printing.finishes),
                });
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
     * Sets how much of one theme the deck should hold, or clears the opinion
     *
     * @param themeId the theme
     * @param level its new level, or `null` to hold no opinion
     */
    function setThemeLevel(themeId: string, level: ThemeLevel | null) {
        save({ ...settings, themes: withThemeLevel(settings.themes, themeId, level) });
    }

    /**
     * Records what this deck is measured against
     *
     * @param next the new targets
     */
    function applyTargets(next: DeckTargets) {
        save({ ...settings, targets: next });
    }

    const unignore = useCallback(
        (card: IgnoredCard) => {
            save({ ...settings, ignored: settings.ignored.filter((held) => held.oracle_id !== card.oracle_id) });
        },
        [settings, save],
    );

    const ignore = useCallback(
        (card: IgnoredCard) => {
            if (settings.ignored.some((held) => held.oracle_id === card.oracle_id)) return;
            save({ ...settings, ignored: [...settings.ignored, { oracle_id: card.oracle_id, name: card.name }] });
            notify.success(t("toast.card-ignored", { name: card.name }), {
                onClick: () => unignore({ oracle_id: card.oracle_id, name: card.name }),
            });
        },
        [settings, save, t, unignore],
    );

    /**
     * Trades one card for another in one request
     *
     * @param going the card being given up
     * @param incoming the card taking its slot
     */
    async function swap(going: CutCandidate, incoming: Suggestion) {
        const printing = suggestionCards.get(incoming.name);
        if (printing === undefined) return;
        const slot = cards.find((held) => held.zone === "Main" && held.card?.oracle_id === going.oracle_id);
        if (slot === undefined) {
            notify.error(t("toast.cut-not-in-deck"));
            return;
        }
        setBusyOracle(going.oracle_id);
        try {
            await Api.decks.cards.swap(deckUuid, slot.uuid, {
                printing: printing.id,
                quantity: 1,
                foil: defaultFoil(printing.finishes),
            });
            notify.success(t("toast.card-swapped", { out: going.name, in: incoming.name }));
            defend(incoming.oracle_id);
            setMakingRoom(null);
            await router.invalidate();
        } finally {
            setBusyOracle(null);
        }
    }

    /**
     * Takes one copy out and puts nothing back, undoably
     *
     * @param candidate the card to let go
     */
    async function cut(candidate: CutCandidate) {
        const slot = cards.find((held) => held.zone === "Main" && held.card?.oracle_id === candidate.oracle_id);
        if (slot === undefined) {
            notify.error(t("toast.cut-not-in-deck"));
            return;
        }
        setBusyOracle(candidate.oracle_id);
        try {
            if (slot.quantity > 1) {
                await Api.decks.cards.update(deckUuid, slot.uuid, { quantity: slot.quantity - 1 });
            } else {
                await Api.decks.cards.delete(deckUuid, slot.uuid);
            }
            notify.success(t("toast.card-cut", { name: candidate.name }), {
                onClick: () => void restore(slot, candidate.name),
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
        await Api.decks.cards.add(deckUuid, { printing: slot.printing, quantity: 1, zone: "Main", foil: slot.foil });
        notify.success(t("toast.card-added", { name }));
        await router.invalidate();
    }

    /**
     * Keeps a card out of the cuts for good, undoably
     *
     * @param candidate the card being kept
     * @param candidate.oracle_id its oracle identity
     * @param candidate.name its name, for the toast
     */
    function keep(candidate: { oracle_id: string; name: string }) {
        if (protectedIds.includes(candidate.oracle_id)) return;
        save({ ...settings, kept: [...settings.kept, { oracle_id: candidate.oracle_id, name: candidate.name }] });
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

    const latest = useRef({ diff, add, cut, keep });
    useEffect(() => {
        latest.current = { diff, add, cut, keep };
    });
    const onPrimary = useCallback((move: Move) => {
        const { diff: now, add: adding, cut: cutting } = latest.current;
        if (move.kind === "cut") void cutting(move.cut);
        else if (now === 0) setMakingRoom(move.suggestion);
        else void adding(move.suggestion);
    }, []);
    const onIgnore = useCallback((move: Move) => ignore({ oracle_id: move.oracle_id, name: move.name }), [ignore]);
    const onMaybe = useCallback(
        (move: Move) => {
            if (move.kind === "add") void addToMaybe(move.suggestion);
        },
        [addToMaybe],
    );
    const onKeep = useCallback((move: Move) => latest.current.keep({ oracle_id: move.oracle_id, name: move.name }), []);

    /**
     * Tunes the deck for what the debrief chose: each direction moves the
     * targets, replacing an earlier answer to the same problem
     *
     * @param chosen the new directions
     */
    function tune(chosen: Array<Direction>) {
        setDebriefOpen(false);
        if (report === null) return;
        let targets = settings.targets;
        let directions = settings.directions;
        for (const direction of chosen) {
            const previous = directions.find((held) => held.problem === direction.problem);
            const previousFix = previous === undefined ? undefined : fixOf(previous);
            if (previousFix !== undefined) targets = shiftTargets(targets, report, previousFix.shift, -1);
            const fix = fixOf(direction);
            if (fix !== undefined) targets = shiftTargets(targets, report, fix.shift, 1);
            directions = [...directions.filter((held) => held.problem !== direction.problem), direction];
        }
        save({ ...settings, targets, directions, debrief_at: null });
        plateauDecided.current = null;
        notify.success(t("toast.tuned"));
    }

    /**
     * Takes a direction back out of the targets
     *
     * @param direction the direction to drop
     */
    function removeDirection(direction: Direction) {
        const fix = fixOf(direction);
        const targets =
            fix === undefined || report === null
                ? settings.targets
                : shiftTargets(settings.targets, report, fix.shift, -1);
        save({
            ...settings,
            targets,
            directions: settings.directions.filter(
                (held) => held.problem !== direction.problem || held.fix !== direction.fix,
            ),
        });
    }

    if (!commander) {
        return <EmptyState title={t("heading.commander-only")} description={t("description.commander-only")} />;
    }
    if (advisor.entries.length === 0) {
        return <EmptyState title={t("heading.empty-deck")} description={t("description.empty-deck")} />;
    }
    if (tooLarge) {
        return (
            <EmptyState
                title={t("heading.deck-too-large")}
                description={t("description.deck-too-large", { count: advisor.entries.length, max: ADVISOR_MAX_CARDS })}
            />
        );
    }

    const cockpitProps: DeckAdvisorCockpitProps = {
        analysis,
        unknown: advisor.unknown,
        targets: settings.targets,
        onSetCurve: (counts) => applyTargets(withCurve(settings.targets, counts)),
        onResetCurve: () => applyTargets(withoutCurve(settings.targets)),
        onSetCorridor: (bucket, corridor) => applyTargets(withCorridor(settings.targets, bucket, corridor)),
        onResetCorridor: (bucket) => applyTargets(withoutCorridor(settings.targets, bucket)),
        onSetTypeCorridor: (type, corridor) => applyTargets(withTypeCorridor(settings.targets, type, corridor)),
        onResetTypeCorridor: (type) => applyTargets(withoutTypeCorridor(settings.targets, type)),
        onResetTargets: () => save({ ...settings, targets: DEFAULT_TARGETS, directions: [] }),
        eminence,
        themePrefs: settings.themes,
        onSetThemeLevel: setThemeLevel,
        themeLabels,
        art,
    };

    const filterDim = dims.find((dim) => dim.key === filter);
    const empty =
        filterDim !== undefined ? (
            <div className={"flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400"}>
                {t("description.no-moves-for", { name: dimLabel(t, filterDim, themeLabels) })}
                <Button plain onClick={() => setFilter(null)}>
                    {t("button.show-all")}
                </Button>
            </div>
        ) : diff === 0 ? (
            <div className={"flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400"}>
                {t("description.no-improvements")}
                <Button outline onClick={() => setDebriefOpen(true)}>
                    {t("button.how-did-it-play")}
                </Button>
            </div>
        ) : (
            <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>
                {swaps.data?.suggestions.commander === null
                    ? t("description.no-commander")
                    : t("description.no-suggestions")}
            </p>
        );

    return (
        <MotionConfig reducedMotion={"user"} transition={{ type: "spring", duration: 0.3, bounce: 0 }}>
            <div className={"flex flex-col gap-6"}>
                <DeckAdvisorHeader
                    count={cardCount}
                    target={target}
                    goals={goalsLine}
                    onOpenGoals={() => setGoalsTab("goals")}
                    onFill={() => setFilling(true)}
                />

                {needsSetup && cardCount >= FRESH_DECK_CARDS && (
                    <DeckAdvisorSetupBanner
                        onSetup={() => setShowingSetup(true)}
                        onNotNow={() => save({ ...settings, setup_done: true })}
                    />
                )}

                {cedh && (
                    <>
                        {lines.data !== null && (
                            <ChartPanel title={t("heading.lines")}>
                                <DeckAdvisorLines report={lines.data} />
                            </ChartPanel>
                        )}
                        {report?.interaction_grid != null && (
                            <ChartPanel title={t("heading.interaction-grid")}>
                                <DeckAdvisorInteractionGrid grid={report.interaction_grid} />
                            </ChartPanel>
                        )}
                        {report?.cedh_stats != null && (
                            <ChartPanel title={t("heading.consistency")}>
                                <DeckAdvisorConsistency
                                    stats={report.cedh_stats}
                                    deckSize={report.deck_size}
                                    completeLines={lines.data?.lines.filter((line) => line.complete)}
                                />
                            </ChartPanel>
                        )}
                    </>
                )}
                {cedh ? <DeckAdvisorShapeSummary {...cockpitProps} /> : <DeckAdvisorCockpit {...cockpitProps} />}

                {swaps.data !== null && (
                    <DeckAdvisorOffTheme
                        leans={swaps.data.suggestions.off_theme ?? []}
                        onExclude={(themeId) => setThemeLevel(themeId, "avoid")}
                    />
                )}

                {swaps.data === null ? (
                    <DeckAdvisorState state={swaps.state} />
                ) : (
                    <div aria-busy={swaps.stale} className={"relative flex flex-col gap-4"}>
                        {swaps.stale && <DeckAdvisorUpdating />}
                        <DeckAdvisorNeeds
                            needs={deckNeeds}
                            themeLabels={themeLabels}
                            selected={filter}
                            onSelect={setFilter}
                        />
                        <DeckAdvisorMoves
                            moves={moves}
                            batch={swaps.data.suggestions.suggestions}
                            notes={swaps.data.suggestions.notes ?? []}
                            lead={
                                swaps.data.suggestions.commander_inferred
                                    ? [
                                          t("description.commander-inferred", {
                                              name: swaps.data.suggestions.commander ?? "",
                                          }),
                                      ]
                                    : []
                            }
                            cards={suggestionCards}
                            cardsState={suggestionCardsState}
                            onRetryCards={retrySuggestionCards}
                            onPrimary={onPrimary}
                            onIgnore={onIgnore}
                            onMaybe={onMaybe}
                            onKeep={onKeep}
                            maybeOracles={maybeOracles}
                            busyOracle={busyOracle}
                            themeLabels={themeLabels}
                            highlight={filter}
                            marks={marks}
                            bracket={claimedRules?.number ?? null}
                            empty={empty}
                        />
                    </div>
                )}

                <DeckAdvisorRoomDialog
                    add={makingRoom}
                    options={roomOptions}
                    facts={facts}
                    cards={suggestionCards}
                    themeLabels={themeLabels}
                    busy={busyOracle !== null}
                    onSwap={(going, incoming) => void swap(going, incoming)}
                    onMaybe={(suggestion) => {
                        setMakingRoom(null);
                        void addToMaybe(suggestion);
                    }}
                    onClose={() => setMakingRoom(null)}
                />

                <DeckAdvisorPlateauDialog
                    open={plateauOpen}
                    onPlay={() => {
                        setPlateauOpen(false);
                        save({ ...settings, debrief_at: daysFromNow(DEBRIEF_AFTER_DAYS) });
                        notify.success(t("toast.debrief-scheduled", { count: DEBRIEF_AFTER_DAYS }));
                    }}
                    onClose={() => setPlateauOpen(false)}
                />

                <DeckAdvisorDebriefDialog
                    open={debriefOpen}
                    deckName={deck.name}
                    onTune={tune}
                    onFine={() => {
                        setDebriefOpen(false);
                        save({ ...settings, debrief_at: null });
                    }}
                    onSomethingElse={() => {
                        setDebriefOpen(false);
                        save({ ...settings, debrief_at: null });
                        setGoalsTab("goals");
                    }}
                    onLater={() => {
                        setDebriefOpen(false);
                        if (settings.debrief_at !== null) {
                            save({ ...settings, debrief_at: daysFromNow(DEBRIEF_SNOOZE_DAYS) });
                        }
                    }}
                />

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
                    counts={bracketCounts}
                    claim={claimedRules}
                />

                <DeckAdvisorGoals
                    tab={goalsTab}
                    onTab={setGoalsTab}
                    onClose={() => setGoalsTab(null)}
                    bracket={deck.bracket ?? Math.round(speed * 4) + 1}
                    claimed={deck.bracket != null}
                    brackets={brackets}
                    houseRules={houseRules}
                    poolQuery={settings.pool_query}
                    onApplyPool={(query) => save({ ...settings, pool_query: query })}
                    ignored={settings.ignored}
                    onUnignore={unignore}
                    kept={settings.kept}
                    onUnkeep={unkeep}
                    settings={settings}
                    onSaveSettings={save}
                    onSaveBracket={saveBracket}
                    detected={detectedThemes}
                    typeSource={report?.type_source}
                    report={report}
                    themeLabels={themeLabels}
                    onSetThemeLevel={setThemeLevel}
                    onSetShape={(shape) => applyTargets({ ...settings.targets, curve: shapeCurve(shape) })}
                    onRemoveDirection={removeDirection}
                    onAddDirection={() => {
                        setGoalsTab(null);
                        setDebriefOpen(true);
                    }}
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
