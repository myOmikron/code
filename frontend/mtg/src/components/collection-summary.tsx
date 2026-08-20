import {
    ArrowTrendingDownIcon,
    ArrowTrendingUpIcon,
    LockClosedIcon,
    RectangleStackIcon,
    SparklesIcon,
    Squares2X2Icon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CollectionStats } from "src/utils/collection-stats";
import { formatCurrency } from "src/utils/format";

/**
 * The properties for {@link CollectionSummary}
 */
export type CollectionSummaryProps = {
    /** Everything already counted */
    stats: CollectionStats;
};

/**
 * The headline numbers above the charts.
 *
 * Split into two levels rather than laid out as one row of equal tiles, because
 * the numbers are not equal. What a collection is worth, what it cost and the
 * gap between the two are one story and the thing anyone opens this page for;
 * how many cards from how many sets is the description of the collection. Giving both
 * the same weight made the page a list of seven facts with no way in.
 *
 * @returns the summary
 */
export function CollectionSummary({ stats }: CollectionSummaryProps) {
    const [t] = useTranslation("collection");

    const change = stats.marketOfPurchased - stats.purchaseTotal;
    const hasPurchases = stats.purchasedCards > 0;
    const up = change >= 0;
    // Against what was paid for the priced cards, not against the whole
    // collection — the others have nothing to compare with.
    const percent = stats.purchaseTotal > 0 ? (change / stats.purchaseTotal) * 100 : null;

    return (
        <div className={"flex flex-col gap-3"}>
            <section
                className={
                    "relative overflow-hidden rounded-(--radius-card) bg-(--surface-card) p-6 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 sm:p-8 dark:ring-white/10"
                }
            >
                {/* Tinted by which way the collection moved, so the panel reads
                    before a single number has been. Decorative only — the sign
                    is stated in the figures either way. */}
                <div
                    aria-hidden={true}
                    className={clsx(
                        "pointer-events-none absolute -top-32 -right-24 size-80 rounded-full blur-3xl",
                        !hasPurchases
                            ? "bg-(--color-brand-500)/10"
                            : up
                              ? "bg-emerald-500/15 dark:bg-emerald-400/10"
                              : "bg-red-500/15 dark:bg-red-400/10",
                    )}
                />

                <div className={"relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"}>
                    <div className={"min-w-0"}>
                        <p
                            className={
                                "text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase dark:text-zinc-400"
                            }
                        >
                            {t("label.market-value")}
                        </p>
                        {/* The one number the page exists for, at a size that
                            says so. `tabular-nums` keeps the digits from
                            shuffling as prices move. */}
                        <p
                            className={
                                "mt-2 text-4xl font-semibold tracking-tight text-zinc-950 tabular-nums sm:text-5xl dark:text-white"
                            }
                        >
                            {formatCurrency(stats.marketValue)}
                        </p>
                        {stats.pricedCards < stats.totalCards && (
                            <p className={"mt-2 text-xs text-zinc-500 dark:text-zinc-400"}>
                                {t("label.priced-cards", { amount: stats.pricedCards })}
                            </p>
                        )}
                    </div>

                    {hasPurchases && (
                        <div className={"flex flex-col items-start gap-1.5 sm:items-end"}>
                            <span
                                className={clsx(
                                    "inline-flex items-center gap-1.5 rounded-(--radius-pill) px-3 py-1.5 text-sm font-semibold tabular-nums ring-1",
                                    up
                                        ? "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/25"
                                        : "bg-red-500/10 text-red-700 ring-red-600/20 dark:text-red-300 dark:ring-red-400/25",
                                )}
                            >
                                {up ? (
                                    <ArrowTrendingUpIcon className={"size-4"} />
                                ) : (
                                    <ArrowTrendingDownIcon className={"size-4"} />
                                )}
                                {up ? "+" : ""}
                                {formatCurrency(change)}
                                {percent !== null && (
                                    <span className={"opacity-60"}>
                                        {up ? "+" : ""}
                                        {percent.toFixed(1)}%
                                    </span>
                                )}
                            </span>
                            <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                                {t("label.against-purchase")}
                            </span>
                        </div>
                    )}
                </div>

                <dl
                    className={
                        "relative mt-6 flex flex-wrap gap-x-10 gap-y-3 border-t border-zinc-950/5 pt-5 dark:border-white/10"
                    }
                >
                    <div>
                        <dt className={"text-xs text-zinc-500 dark:text-zinc-400"}>{t("label.purchase-value")}</dt>
                        <dd className={"mt-0.5 text-base font-semibold text-zinc-950 tabular-nums dark:text-white"}>
                            {hasPurchases ? formatCurrency(stats.purchaseTotal) : "—"}
                        </dd>
                    </div>
                    <div>
                        <dt className={"text-xs text-zinc-500 dark:text-zinc-400"}>{t("label.cards-recorded")}</dt>
                        <dd className={"mt-0.5 text-base font-semibold text-zinc-950 tabular-nums dark:text-white"}>
                            {hasPurchases ? stats.purchasedCards : t("label.no-purchase-prices")}
                        </dd>
                    </div>
                </dl>
            </section>

            {/* One panel cut by hairlines rather than four floating cards: the
                gap is the container's colour showing through, which holds at
                every breakpoint without a divider utility that only works in
                one direction. */}
            <div
                className={
                    "grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-card) bg-zinc-950/5 ring-1 ring-zinc-950/5 sm:grid-cols-4 dark:bg-white/10 dark:ring-white/10"
                }
            >
                <Cell icon={<RectangleStackIcon />} label={t("label.total-cards")} value={stats.totalCards} />
                <Cell icon={<Squares2X2Icon />} label={t("label.sets")} value={stats.distinctSets} />
                <Cell
                    icon={<SparklesIcon />}
                    label={t("label.average-value")}
                    value={formatCurrency(stats.averageValue)}
                />
                <Cell
                    icon={<LockClosedIcon />}
                    label={t("label.reserved-list")}
                    value={stats.reservedCards}
                    sub={stats.reservedCards === 0 ? undefined : formatCurrency(stats.reservedValue)}
                />
            </div>
        </div>
    );
}

/**
 * The properties for {@link Cell}
 */
type CellProps = {
    /** Leading icon */
    icon: ReactNode;
    /** What the number is */
    label: string;
    /** The number */
    value: ReactNode;
    /** An aside shown under the value */
    sub?: ReactNode;
};

/**
 * One compartment of the strip below the hero.
 *
 * Icons stay muted zinc rather than the brand chip the shared tile uses: the
 * hero already spends the page's colour on the one thing that moves, and a row
 * of blue squares underneath would compete with it for no reason.
 *
 * @returns the compartment
 */
function Cell({ icon, label, value, sub }: CellProps) {
    return (
        <div className={"bg-(--surface-card) p-4"}>
            <div className={"flex items-center gap-2 text-zinc-500 dark:text-zinc-400"}>
                <span className={"*:data-[slot=icon]:size-4"}>{icon}</span>
                <span className={"truncate text-xs"}>{label}</span>
            </div>
            <p className={"mt-1.5 text-xl font-semibold text-zinc-950 tabular-nums dark:text-white"}>{value}</p>
            {sub !== undefined && <p className={"mt-0.5 text-xs text-zinc-500 dark:text-zinc-400"}>{sub}</p>}
        </div>
    );
}
