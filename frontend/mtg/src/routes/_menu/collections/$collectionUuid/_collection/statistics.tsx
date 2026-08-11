import { createFileRoute } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { EmptyState, ProgressBar, Strong, Text } from "components";
import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "src/utils/format";
import { computeCollectionStats } from "src/utils/collection-stats";
import { resolvePrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
import { CollectionSummary } from "src/components/collection-summary";
import { StatBreakdown } from "src/components/stat-breakdown";
import { CONDITION_ORDER, ConditionBadge, FINISH_ORDER, FinishBadge } from "src/components/card-attribute-badge";

/**
 * The charts, and with them recharts, fetched only once this page is on screen.
 *
 * Route-level splitting already keeps them off every other page, but it would
 * still hold this one blank until a third of a megabyte has arrived. The counts
 * above the charts need none of that code, so they render first and the
 * drawings drop in when they are ready.
 */
const CollectionCharts = lazy(() =>
    import("src/components/charts/collection-charts").then((module) => ({ default: module.CollectionCharts })),
);

/** How many placeholders stand in for the charts while they load */
const CHART_PLACEHOLDERS = 4;

export const Route = createFileRoute("/_menu/collections/$collectionUuid/_collection/statistics")({
    // The one page that genuinely wants every stack: a mana curve over the
    // first sixty would be a lie. It therefore loads them itself rather than
    // making the card list next door pay for it too.
    loader: async ({ params }) => {
        const listed = await Api.collections.entries.list(params.collectionUuid);
        return { entries: listed.entries };
    },
    component: RouteComponent,
});

/**
 * What the collection is made of, in numbers.
 *
 * Everything is derived from the entries the layout already loaded — the tab
 * costs no request, and switching back and forth is free. Prices are Scryfall's
 * current euro market price, so the totals move on their own even when nothing
 * was filed.
 *
 * @returns the page
 */
function RouteComponent() {
    const { entries } = Route.useLoaderData();
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    // Unlike the card list, this page genuinely needs every card: a mana curve
    // over the first sixty stacks would be a lie. So it does the one thing the
    // loader must not — wait for the lot — but on screen and with a bar,
    // instead of holding the whole route back.
    const [printings, setPrintings] = useState<Map<string, Printing> | null>(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        let dropped = false;
        setPrintings(null);
        void resolvePrintings(
            entries.map((entry) => entry.printing),
            (done, total) => {
                if (!dropped) setProgress(Math.round((done / total) * 100));
            },
        ).then((resolved) => {
            if (!dropped) setPrintings(resolved);
        });
        return () => {
            dropped = true;
        };
    }, [entries]);

    // Not computed until there is something to compute from: hooks run before
    // the early returns below, so without the guard every mount walked all
    // eleven thousand entries once against an empty map and threw it away.
    const stats = useMemo(
        () => (printings === null ? null : computeCollectionStats(entries, printings)),
        [entries, printings],
    );

    // The charts are by far the most expensive thing on the page — fourteen of
    // them laid out in one commit. Handing them a deferred copy lets React put
    // the numbers on screen first and draw the charts in a second, lower
    // priority pass, rather than blocking on the whole page at once.
    const deferredStats = useDeferredValue(stats);

    if (entries.length === 0) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    if (stats === null) {
        return (
            <div className={"flex flex-col gap-2"}>
                <Text className={"text-xs"}>{t("label.resolving-cards", { amount: entries.length })}</Text>
                <ProgressBar progress={progress} />
            </div>
        );
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
                        value: entries
                            .filter((entry) => entry.condition === condition)
                            .reduce((sum, entry) => sum + entry.quantity, 0),
                    }))}
                />
                <StatBreakdown
                    title={t("heading.finish")}
                    rows={FINISH_ORDER.map((finish) => ({
                        key: finish,
                        label: <FinishBadge finish={finish} />,
                        value: entries
                            .filter((entry) => entry.finish === finish)
                            .reduce((sum, entry) => sum + entry.quantity, 0),
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
                                {card.printing.imageUrl !== null && (
                                    <img
                                        src={card.printing.imageUrl}
                                        crossOrigin={"anonymous"}
                                        alt={card.printing.name}
                                        loading={"lazy"}
                                        className={
                                            "aspect-5/7 h-12 w-auto shrink-0 rounded bg-zinc-200 object-cover dark:bg-zinc-700"
                                        }
                                    />
                                )}
                                <div className={"flex min-w-0 flex-1 flex-col"}>
                                    <Strong className={"truncate"}>{card.printing.name}</Strong>
                                    <Text className={"text-xs"}>
                                        {card.printing.setName} ·{" "}
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
