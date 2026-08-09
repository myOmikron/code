import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import {
    ArchiveBoxIcon,
    ArrowTrendingUpIcon,
    BanknotesIcon,
    LockClosedIcon,
    RectangleStackIcon,
    ScaleIcon,
    SparklesIcon,
    Squares2X2Icon,
} from "@heroicons/react/20/solid";
import { EmptyState, ProgressBar, StatTile, Strong, Text } from "components";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "src/utils/format";
import { computeCollectionStats } from "src/utils/collection-stats";
import { resolvePrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
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
    const { entries } = useLoaderData({ from: "/_menu/collections/$collectionUuid/_collection" });
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

    // A few thousand entries walked a dozen times over is nothing, but it would
    // run again on every unrelated re-render without this.
    const stats = useMemo(() => computeCollectionStats(entries, printings ?? new Map()), [entries, printings]);

    if (entries.length === 0) {
        return <EmptyState title={t("heading.no-statistics")} description={t("description.no-statistics")} />;
    }

    if (printings === null) {
        return (
            <div className={"flex flex-col gap-2"}>
                <Text className={"text-xs"}>{t("label.resolving-cards", { amount: entries.length })}</Text>
                <ProgressBar progress={progress} />
            </div>
        );
    }

    const change = stats.marketOfPurchased - stats.purchaseTotal;

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"grid gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
                <StatTile icon={<RectangleStackIcon />} label={t("label.total-cards")} value={stats.totalCards} />
                <StatTile icon={<ArchiveBoxIcon />} label={t("label.stacks")} value={stats.stacks} />
                <StatTile icon={<Squares2X2Icon />} label={t("label.sets")} value={stats.distinctSets} />
                <StatTile
                    icon={<SparklesIcon />}
                    label={t("label.average-value")}
                    value={formatCurrency(stats.averageValue)}
                />
                <StatTile
                    icon={<BanknotesIcon />}
                    label={t("label.market-value")}
                    value={formatCurrency(stats.marketValue)}
                    sub={
                        stats.pricedCards < stats.totalCards
                            ? t("label.priced-cards", { amount: stats.pricedCards })
                            : undefined
                    }
                />
                <StatTile
                    icon={<ScaleIcon />}
                    label={t("label.purchase-value")}
                    value={stats.purchasedCards === 0 ? "—" : formatCurrency(stats.purchaseTotal)}
                    sub={
                        stats.purchasedCards === 0
                            ? t("label.no-purchase-prices")
                            : t("label.purchased-cards", { amount: stats.purchasedCards })
                    }
                />
                <StatTile
                    icon={<ArrowTrendingUpIcon />}
                    label={t("label.value-delta")}
                    value={
                        stats.purchasedCards === 0 ? (
                            "—"
                        ) : (
                            <span
                                className={
                                    change < 0
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-emerald-600 dark:text-emerald-400"
                                }
                            >
                                {change > 0 ? "+" : ""}
                                {formatCurrency(change)}
                            </span>
                        )
                    }
                    sub={stats.purchasedCards === 0 ? undefined : t("label.against-purchase")}
                />
                <StatTile
                    icon={<LockClosedIcon />}
                    label={t("label.reserved-list")}
                    value={stats.reservedCards}
                    sub={stats.reservedCards === 0 ? undefined : formatCurrency(stats.reservedValue)}
                />
            </div>

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
                <CollectionCharts stats={stats} />
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
                                        alt={card.printing.name}
                                        loading={"lazy"}
                                        className={"h-12 w-auto shrink-0 rounded"}
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
