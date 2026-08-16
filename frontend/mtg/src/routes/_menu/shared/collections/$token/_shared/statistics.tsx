import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, Strong, Text } from "components";
import { Suspense, lazy, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CONDITION_ORDER, ConditionBadge, FINISH_ORDER, FinishBadge } from "src/components/card-attribute-badge";
import { CollectionSummary } from "src/components/collection-summary";
import { StatBreakdown } from "src/components/stat-breakdown";
import { statsFromResponse } from "src/utils/collection-stats";
import { formatCurrency } from "src/utils/format";
import { isDeadShareLink } from "src/utils/share-link";

/** The charts, and with them recharts, fetched only once this page is on screen */
const CollectionCharts = lazy(() =>
    import("src/components/charts/collection-charts").then((module) => ({ default: module.CollectionCharts })),
);

/** How many placeholders stand in for the charts while they load */
const CHART_PLACEHOLDERS = 4;

export const Route = createFileRoute("/_menu/shared/collections/$token/_shared/statistics")({
    loader: async ({ params }) => {
        try {
            return { stats: statsFromResponse(await Api.shared.collections.statistics(params.token)) };
        } catch (error) {
            if (isDeadShareLink(error)) return { stats: null };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * What a shared collection is made of, in numbers, minus what was paid for them.
 *
 * @returns the page
 */
function RouteComponent() {
    const { stats } = Route.useLoaderData();
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    const deferredStats = useDeferredValue(stats);

    if (stats === null || stats.totalCards === 0) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <CollectionSummary stats={stats} />

            <Suspense
                fallback={
                    <div className={"grid gap-6 lg:grid-cols-2"}>
                        {Array.from({ length: CHART_PLACEHOLDERS }, (_, index) => (
                            <div
                                key={index}
                                className={
                                    "h-80 animate-pulse rounded-(--radius-card) bg-(--surface-card) ring-1 ring-zinc-950/5 dark:ring-white/10"
                                }
                            />
                        ))}
                    </div>
                }
            >
                {deferredStats !== null && <CollectionCharts stats={deferredStats} />}
            </Suspense>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <StatBreakdown
                    title={t("heading.condition")}
                    rows={CONDITION_ORDER.map((condition) => ({
                        key: condition,
                        label: <ConditionBadge condition={condition} />,
                        value: stats.conditions.find((bucket) => bucket.key === condition)?.cards ?? 0,
                    }))}
                />
                <StatBreakdown
                    title={t("heading.finish")}
                    rows={FINISH_ORDER.map((finish) => ({
                        key: finish,
                        label: <FinishBadge finish={finish} />,
                        value: stats.finishes.find((bucket) => bucket.key === finish)?.cards ?? 0,
                    }))}
                />
            </div>

            {stats.topCards.length > 0 && (
                <div
                    className={
                        "rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                    }
                >
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                        {t("heading.most-valuable")}
                    </h3>
                    <ul className={"mt-4 flex flex-col gap-3"}>
                        {stats.topCards.map((card) => (
                            <li key={card.uuid} className={"flex items-center gap-3"}>
                                {card.imageUrl !== null && (
                                    <img
                                        src={card.imageUrl}
                                        crossOrigin={"anonymous"}
                                        alt={card.name}
                                        loading={"lazy"}
                                        className={
                                            "aspect-5/7 h-12 w-auto shrink-0 rounded bg-zinc-200 object-cover dark:bg-zinc-700"
                                        }
                                    />
                                )}
                                <div className={"flex min-w-0 flex-1 flex-col"}>
                                    <Strong className={"truncate"}>{card.name}</Strong>
                                    <Text className={"text-xs"}>
                                        {card.setName} ·{" "}
                                        {tg("label.cards", { count: card.copies, amount: card.copies })}
                                    </Text>
                                </div>
                                <Strong className={"shrink-0 tabular-nums"}>{formatCurrency(card.value)}</Strong>
                            </li>
                        ))}
                    </ul>
                    {stats.oldest !== null && (
                        <Text className={"mt-4 text-xs"}>
                            {t("label.oldest-printing", {
                                name: stats.oldest.name,
                                set: stats.oldest.setName,
                                year: stats.oldest.releasedAt.slice(0, 4),
                            })}
                        </Text>
                    )}
                </div>
            )}
        </div>
    );
}
