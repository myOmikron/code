import { ResponsiveContainer } from "recharts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CardFinish, PriceDayResponse } from "src/api/generated";
import { PriceHistoryChart } from "src/components/charts/price-history-chart";
import { formatChange, formatCurrency, formatDay, formatFullDay } from "src/utils/format";
import { seriesFor, statsFor } from "src/utils/price-history";

/** How tall the chart is drawn */
const CHART_HEIGHT = 176;

/**
 * The properties for {@link PriceHistoryPanel}
 */
export type PriceHistoryPanelProps = {
    /** Scryfall's id of the printing, `null` while there is nothing to show */
    printing: string | null | undefined;
    /** The finish the reader is holding, so the chart prices what they own */
    finish?: CardFinish;
    /** Additional CSS classes */
    className?: string;
};

/**
 * The properties for {@link Figure}
 */
type FigureProps = {
    /** What the number is */
    label: string;
    /** The number, already rendered */
    value: string;
    /** A second line under it, e.g. the day it is from */
    note?: string;
    /** Which way it went, which decides the colour */
    direction?: "up" | "down" | null;
};

/** How a change is coloured: dearer is red, cheaper is green, for a buyer */
const DIRECTIONS: Record<"up" | "down", string> = {
    up: "text-red-600 dark:text-red-400",
    down: "text-green-600 dark:text-green-400",
};

/**
 * One number in the row beside the chart
 *
 * @returns the figure
 */
function Figure({ label, value, note, direction }: FigureProps) {
    const tone = direction == null ? "text-zinc-950 dark:text-white" : DIRECTIONS[direction];
    return (
        <div className={"min-w-0"}>
            <p className={"truncate text-xs/5 text-zinc-500 dark:text-zinc-400"}>{label}</p>
            <p className={`truncate text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
            {note !== undefined && <p className={"truncate text-xs/5 text-zinc-500 dark:text-zinc-400"}>{note}</p>}
        </div>
    );
}

/**
 * What a card has cost, and what that says about buying it now.
 *
 * Fetched when the panel appears rather than with whatever opened it: a card is
 * looked at far more often than its history is read, and the history is a
 * second request against a table the list view never touches.
 *
 * Draws nothing at all when there is no history. That is the normal answer for
 * a token, a digital-only printing and anything else Cardmarket does not sell
 * as a product, and an empty chart frame would only ask the reader to work out
 * why it is empty.
 *
 * @returns the panel, or nothing
 */
export function PriceHistoryPanel({ printing, finish = "Nonfoil", className }: PriceHistoryPanelProps) {
    const [t] = useTranslation("collection");
    const [days, setDays] = useState<Array<PriceDayResponse> | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (printing == null) return;
        setDays(null);
        setFailed(false);

        let cancelled = false;
        void Api.printings
            .priceHistoryQuietly(printing)
            .then((answer) => {
                if (!cancelled) setDays(answer.days);
            })
            .catch((error: unknown) => {
                // Logged, because the panel's own answer to a failure is to
                // disappear — which looks exactly like a card the guide does
                // not carry. Without this line the two are indistinguishable
                // from the outside, and "nothing is showing anywhere" has no
                // thread to pull on.
                console.warn("price history could not be read", error);
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [printing]);

    if (printing == null || failed) return null;

    // Nothing at all while the answer is on its way, not a reserved box. Most
    // cards are opened, looked at and closed inside the time this request
    // takes, and a placeholder would put a hole in every one of those dialogs
    // for a chart that in many cases never arrives — Cardmarket carries no
    // product for a token or a digital-only printing. The panel appears when it
    // has something to draw and stays away otherwise.
    if (days === null) return null;

    const series = seriesFor(days, finish);
    const stats = statsFor(series.points);
    if (stats.current === null || stats.currentDay === null) return null;

    return (
        <div className={`flex flex-col gap-3 ${className ?? ""}`}>
            <div className={"flex items-baseline justify-between gap-3"}>
                <h4 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.price-history")}</h4>
                <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                    {t("label.price-history-days", { days: series.points.length })}
                </p>
            </div>

            {series.substituted && (
                <p className={"text-xs/5 text-amber-700 dark:text-amber-400"}>
                    {t("description.price-history-nonfoil-fallback")}
                </p>
            )}

            <div className={"text-zinc-400 dark:text-zinc-500"}>
                <ResponsiveContainer width={"100%"} height={CHART_HEIGHT}>
                    <PriceHistoryChart
                        data={series.points}
                        lowName={t("label.price-low")}
                        trendName={t("label.price-trend")}
                        low={stats.low?.value ?? null}
                        lowMarkName={t("label.price-all-time-low")}
                        formatDay={formatDay}
                        formatValue={formatCurrency}
                    />
                </ResponsiveContainer>
            </div>

            <dl className={"grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4"}>
                <Figure
                    label={t("label.price-current")}
                    value={formatCurrency(stats.current)}
                    note={formatFullDay(stats.currentDay)}
                />
                {stats.changes.map((change) => (
                    <Figure
                        key={change.days}
                        label={t("label.price-change-days", { days: change.days })}
                        value={change.fraction === null ? "—" : formatChange(change.fraction)}
                        note={change.from === null ? undefined : formatCurrency(change.from)}
                        direction={
                            change.fraction === null || change.fraction === 0
                                ? null
                                : change.fraction > 0
                                  ? "up"
                                  : "down"
                        }
                    />
                ))}
            </dl>

            {stats.low !== null && stats.high !== null && (
                <div className={"flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs/5"}>
                    <span className={"text-zinc-500 dark:text-zinc-400"}>
                        {t("label.price-low-on", {
                            price: formatCurrency(stats.low.value),
                            day: formatFullDay(stats.low.day),
                        })}
                    </span>
                    <span className={"text-zinc-500 dark:text-zinc-400"}>
                        {t("label.price-high-on", {
                            price: formatCurrency(stats.high.value),
                            day: formatFullDay(stats.high.day),
                        })}
                    </span>
                </div>
            )}

            {stats.position !== null && (
                // Where today sits between the two ends of the window, which is
                // the one thing a chart makes a reader squint to work out.
                <div>
                    <div className={"h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-700"}>
                        <div
                            className={"h-1.5 rounded-full bg-indigo-500"}
                            style={{ width: `${Math.round(stats.position * 100)}%` }}
                        />
                    </div>
                    <p className={"mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("description.price-position", {
                            percent: Math.round(stats.position * 100),
                        })}
                    </p>
                </div>
            )}
        </div>
    );
}
