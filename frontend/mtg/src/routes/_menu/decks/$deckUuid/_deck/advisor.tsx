import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { Button, EmptyState, LocalTab, TabMenu, Text, notify } from "components";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CutCandidate, Suggestion } from "src/api/graph-generated";
import { DeckAdvisorCombos } from "src/components/deck-advisor-combos";
import { DeckAdvisorCuts } from "src/components/deck-advisor-cuts";
import { DeckAdvisorDiagnostics } from "src/components/deck-advisor-diagnostics";
import { DeckAdvisorSpeed } from "src/components/deck-advisor-speed";
import { DeckAdvisorSuggestions } from "src/components/deck-advisor-suggestions";
import { DeckFillDialog } from "src/components/deck-fill-dialog";
import { DeckIgnoreDialog } from "src/components/deck-ignore-dialog";
import { advisorDeck, bracketSpeed } from "src/utils/deck-advisor";
import { IgnoredCard, readIgnored, writeIgnored } from "src/utils/deck-ignore";
import { readSpeedOverride, writeSpeedOverride } from "src/utils/deck-speed";
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
    const [filling, setFilling] = useState(false);
    const [managingIgnored, setManagingIgnored] = useState(false);

    // Read per deck: the route component survives a switch to another deck.
    useEffect(() => {
        setSpeedOverride(readSpeedOverride(deckUuid));
        setIgnored(readIgnored(deckUuid));
    }, [deckUuid]);

    const advisor = useMemo(() => advisorDeck(cards), [cards]);
    const commander = deck.format === "commander";
    const speed = speedOverride ?? bracketSpeed(deck.bracket);
    const excludedIds = useMemo(() => ignored.map((card) => card.oracle_id), [ignored]);
    const analysis = useDeckAnalysis(advisor, speed, commander);
    const swaps = useDeckSwaps(advisor, speed, excludedIds, commander && (section === "adds" || section === "cuts"));
    const playedNames = useMemo(
        () =>
            cards
                .filter((slot) => slot.zone === "Main" || slot.zone === "Commander")
                .flatMap((slot) => (slot.card?.name == null ? [] : [slot.card.name])),
        [cards],
    );
    const combos = useDeckCombos(advisor, playedNames, commander && section === "combos");
    const suggestionNames = useMemo(
        () => (swaps.state === "ready" ? [...new Set(swaps.swaps.suggestions.suggestions.map((s) => s.name))] : []),
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
            await router.invalidate();
        } finally {
            setBusyOracle(null);
        }
    }

    /**
     * Files the missing piece of a combo into the mainboard, placed by name
     *
     * @param name the missing card's name
     */
    async function addByName(name: string) {
        setBusyOracle(name);
        try {
            const [placed] = await resolveLookups([{ name }]);
            if (placed === null) return;
            await Api.decks.cards.add(deckUuid, { printing: placed.id, quantity: 1, zone: "Main" });
            notify.success(t("toast.card-added", { name }));
            await router.invalidate();
        } finally {
            setBusyOracle(null);
        }
    }

    /**
     * Rules a suggestion out for good — the advisor never offers it again
     *
     * @param suggestion the turned-down suggestion
     */
    function ignore(suggestion: Suggestion) {
        const next = [...ignored, { oracle_id: suggestion.oracle_id, name: suggestion.name }];
        setIgnored(next);
        writeIgnored(deckUuid, next);
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
     * Takes one copy of a cut candidate out of the mainboard
     *
     * @param cut the accepted cut
     */
    async function remove(cut: CutCandidate) {
        const slot = cards.find((held) => held.zone === "Main" && held.card?.oracle_id === cut.oracle_id);
        if (slot === undefined) return;
        setBusyOracle(cut.oracle_id);
        try {
            if (slot.quantity > 1) {
                await Api.decks.cards.update(deckUuid, slot.uuid, { quantity: slot.quantity - 1 });
            } else {
                await Api.decks.cards.delete(deckUuid, slot.uuid);
            }
            notify.success(t("toast.card-cut", { name: cut.name }));
            await router.invalidate();
        } finally {
            setBusyOracle(null);
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

            {section === "diagnostics" && <DeckAdvisorDiagnostics analysis={analysis} unknown={advisor.unknown} />}

            {(section === "adds" || section === "cuts") && swaps.state === "unavailable" && (
                <EmptyState
                    title={t("heading.advisor-unavailable")}
                    description={t("description.advisor-unavailable")}
                />
            )}
            {(section === "adds" || section === "cuts") && (swaps.state === "loading" || swaps.state === "idle") && (
                <Text className={"py-12 text-center"}>{t("label.analyzing")}</Text>
            )}
            {section === "adds" && swaps.state === "ready" && (
                <div className={PANEL}>
                    <DeckAdvisorSuggestions
                        report={swaps.swaps.suggestions}
                        cards={suggestionCards}
                        onAdd={(suggestion) => void add(suggestion)}
                        onIgnore={ignore}
                        busyOracle={busyOracle}
                    />
                </div>
            )}
            {section === "cuts" && swaps.state === "ready" && (
                <div className={PANEL}>
                    <DeckAdvisorCuts
                        cuts={swaps.swaps.cuts}
                        swaps={swaps.swaps.swaps}
                        onCut={(cut) => void remove(cut)}
                        busyOracle={busyOracle}
                    />
                </div>
            )}

            {section === "combos" && combos.state === "unavailable" && (
                <EmptyState
                    title={t("heading.advisor-unavailable")}
                    description={t("description.advisor-unavailable")}
                />
            )}
            {section === "combos" && (combos.state === "loading" || combos.state === "idle") && (
                <Text className={"py-12 text-center"}>{t("label.analyzing")}</Text>
            )}
            {section === "combos" && combos.state === "ready" && (
                <div className={PANEL}>
                    <DeckAdvisorCombos
                        combos={combos.combos}
                        onAdd={(name) => void addByName(name)}
                        busy={busyOracle !== null}
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
