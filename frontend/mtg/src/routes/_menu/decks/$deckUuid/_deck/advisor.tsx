import { createFileRoute, useLoaderData, useNavigate, useRouter } from "@tanstack/react-router";
import { EmptyState, LocalTab, TabMenu, Text, notify } from "components";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CutCandidate, Suggestion } from "src/api/graph-generated";
import { DeckAdvisorCuts } from "src/components/deck-advisor-cuts";
import { DeckAdvisorDiagnostics } from "src/components/deck-advisor-diagnostics";
import { DeckAdvisorSuggestions } from "src/components/deck-advisor-suggestions";
import { advisorDeck, bracketSpeed } from "src/utils/deck-advisor";
import { useDeckAnalysis } from "src/utils/use-deck-analysis";
import { useDeckSwaps } from "src/utils/use-deck-swaps";
import { useSuggestionCards } from "src/utils/use-suggestion-cards";

/** The advisor's sections; diagnostics is the default and stays out of the URL */
type AdvisorSection = "diagnostics" | "adds" | "cuts";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/advisor")({
    validateSearch: (search: Record<string, unknown>): { section?: AdvisorSection } => ({
        section: search.section === "adds" || search.section === "cuts" ? search.section : undefined,
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

    const advisor = useMemo(() => advisorDeck(cards), [cards]);
    const commander = deck.format === "commander";
    const speed = bracketSpeed(deck.bracket);
    const analysis = useDeckAnalysis(advisor, speed, commander);
    const swaps = useDeckSwaps(advisor, speed, commander && section !== "diagnostics");
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
            </TabMenu>

            {section === "diagnostics" && <DeckAdvisorDiagnostics analysis={analysis} unknown={advisor.unknown} />}

            {section !== "diagnostics" && swaps.state === "unavailable" && (
                <EmptyState
                    title={t("heading.advisor-unavailable")}
                    description={t("description.advisor-unavailable")}
                />
            )}
            {section !== "diagnostics" && (swaps.state === "loading" || swaps.state === "idle") && (
                <Text className={"py-12 text-center"}>{t("label.analyzing")}</Text>
            )}
            {section === "adds" && swaps.state === "ready" && (
                <div className={PANEL}>
                    <DeckAdvisorSuggestions
                        report={swaps.swaps.suggestions}
                        cards={suggestionCards}
                        onAdd={(suggestion) => void add(suggestion)}
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
        </div>
    );
}
