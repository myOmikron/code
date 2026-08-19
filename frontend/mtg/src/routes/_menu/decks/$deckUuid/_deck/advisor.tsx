import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { EmptyState, Text } from "components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { BarDistribution } from "src/components/charts/bar-distribution";
import { ChartCard } from "src/components/charts/chart-card";
import { DeckAdvisorBalance } from "src/components/deck-advisor-balance";
import { DeckAdvisorCurve } from "src/components/deck-advisor-curve";
import { DeckAdvisorQuotas } from "src/components/deck-advisor-quotas";
import { advisorDeck, bracketSpeed } from "src/utils/deck-advisor";
import { useDeckAnalysis } from "src/utils/use-deck-analysis";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/advisor")({
    loader: ({ params }) => Api.decks.cards.list(params.deckUuid),
    component: RouteComponent,
});

/** The surface the non-chart panels sit on, the same one {@link ChartCard} uses */
const PANEL =
    "flex flex-col rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10";

/**
 * The graph advisor's read of the deck: role coverage, curve against target,
 * resource balance and themes.
 *
 * Everything here comes from the mtg-graph service and is opinion — the
 * statistics tab keeps the plain facts. An unreachable graph therefore
 * degrades to a note where the panels would be, never to the error screen.
 *
 * @returns the page
 */
function RouteComponent() {
    const { cards } = Route.useLoaderData();
    const { deck } = useLoaderData({ from: "/_menu/decks/$deckUuid/_deck" });
    const [t] = useTranslation("advisor");
    const advisor = useMemo(() => advisorDeck(cards), [cards]);
    const commander = deck.format === "commander";
    const analysis = useDeckAnalysis(advisor, bracketSpeed(deck.bracket), commander);

    if (!commander) {
        return <EmptyState title={t("heading.commander-only")} description={t("description.commander-only")} />;
    }
    if (advisor.entries.length === 0) {
        return <EmptyState title={t("heading.empty-deck")} description={t("description.empty-deck")} />;
    }
    if (analysis.state === "unavailable") {
        return (
            <EmptyState title={t("heading.advisor-unavailable")} description={t("description.advisor-unavailable")} />
        );
    }
    if (analysis.state !== "ready") {
        return <Text className={"py-12 text-center"}>{t("label.analyzing")}</Text>;
    }

    const report = analysis.diagnostics;
    // What the graph could not resolve plus what the catalog itself does not
    // know — either way the analysis is missing those cards and says so.
    const missing = (report.unresolved?.length ?? 0) + advisor.unknown;

    return (
        <div className={"flex flex-col gap-6"}>
            {missing > 0 && <Text>{t("description.partial-coverage", { amount: missing })}</Text>}
            <div className={"grid gap-6 lg:grid-cols-2"}>
                <div className={PANEL}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.quotas")}</h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.quotas")}</p>
                    <div className={"mt-4"}>
                        <DeckAdvisorQuotas buckets={report.buckets} />
                    </div>
                </div>
                <ChartCard title={t("heading.curve")} hint={t("description.curve-legend")}>
                    <DeckAdvisorCurve curve={report.curve} />
                </ChartCard>
            </div>
            <div className={"grid items-start gap-6 lg:grid-cols-2"}>
                <div className={PANEL}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.balance")}</h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.balance")}</p>
                    <div className={"mt-4 max-h-96 overflow-y-auto"}>
                        <DeckAdvisorBalance balance={report.balance} />
                    </div>
                </div>
                {report.themes !== undefined && report.themes.length > 0 && (
                    <ChartCard title={t("heading.themes")} hint={t("description.themes")}>
                        <BarDistribution
                            layout={"rows"}
                            data={report.themes.map((theme) => ({ label: theme.label, value: theme.share }))}
                            format={(value) => `${Math.round(value * 100)} %`}
                        />
                    </ChartCard>
                )}
            </div>
        </div>
    );
}
