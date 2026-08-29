import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, Text } from "components";
import { Suspense, lazy, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CONDITION_ORDER, ConditionBadge, FINISH_ORDER, FinishBadge } from "src/components/card-attribute-badge";
import { CollectionSummary } from "src/components/collection-summary";
import { StatBreakdown } from "src/components/stat-breakdown";
import { statsFromResponse } from "src/utils/collection-stats";
import { isNotPublic } from "src/utils/public-page";

/** The charts, and with them recharts, fetched only once this page is on screen */
const CollectionCharts = lazy(() =>
    import("src/components/charts/collection-charts").then((module) => ({ default: module.CollectionCharts })),
);

/** How many placeholders stand in for the charts while they load */
const CHART_PLACEHOLDERS = 4;

export const Route = createFileRoute("/_menu/global/collections/$collectionUuid/_collection/statistics")({
    loader: async ({ params }) => {
        try {
            return { stats: statsFromResponse(await Api.explore.collections.statistics(params.collectionUuid)) };
        } catch (error) {
            if (isNotPublic(error)) return { stats: null };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * What a collection somebody put on show is made of, in numbers, with every figure in money left out.
 *
 * @returns the page
 */
function RouteComponent() {
    const { stats } = Route.useLoaderData();
    const [t] = useTranslation("collection");

    const deferredStats = useDeferredValue(stats);

    if (stats === null || stats.totalCards === 0) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <CollectionSummary stats={stats} prices={false} />

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
                {deferredStats !== null && <CollectionCharts stats={deferredStats} prices={false} />}
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

            {stats.oldest !== null && (
                <div
                    className={
                        "rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                    }
                >
                    <Text className={"text-xs"}>
                        {t("label.oldest-printing", {
                            name: stats.oldest.name,
                            set: stats.oldest.setName,
                            year: stats.oldest.releasedAt.slice(0, 4),
                        })}
                    </Text>
                </div>
            )}
        </div>
    );
}
