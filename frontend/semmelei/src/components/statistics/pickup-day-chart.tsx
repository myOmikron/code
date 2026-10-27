import React from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "src/components/statistics/chart-card";
import {
    formatAxis,
    ItemSeries,
    measureLegend,
    renderMeasureSeries,
    StatisticsTooltip,
} from "src/components/statistics/series";
import { SeriesLegend } from "src/components/statistics/series-legend";
import { Measure, PickupDayPoint } from "src/utils/statistics";

const DATE = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
const OPEN_OPACITY = 0.45;

/**
 * Format an effective pickup date
 *
 * @param date the date (`YYYY-MM-DD`)
 *
 * @returns e.g. "Fr., 03.07."
 */
function formatPickupDate(date: string): string {
    return DATE.format(new Date(`${date}T00:00:00Z`));
}

/** The properties of {@link PickupDayTick} */
type PickupDayTickProps = {
    /** Position, set by recharts */
    x?: number;
    /** Position, set by recharts */
    y?: number;
    /** The tick, set by recharts */
    payload?: { value: string };
    /** The pickup days, to find the markers of a date */
    days: PickupDayPoint[];
    /** Marker of a day that is not Dispatched yet */
    openLabel: string;
    /** Marker of a Called Off day */
    calledOffLabel: string;
};

/**
 * Axis tick with the pickup date and its "noch offen" or "abgesagt" marker
 *
 * @returns the tick
 */
function PickupDayTick(props: PickupDayTickProps) {
    const { x = 0, y = 0, payload, days, openLabel, calledOffLabel } = props;
    if (payload === undefined) return null;
    const day = days.find((candidate) => candidate.date === payload.value);
    const marker = day?.isCalledOff ? calledOffLabel : day?.open ? openLabel : undefined;

    return (
        <g transform={`translate(${x},${y})`}>
            <text dy={12} textAnchor={"middle"} fontSize={12} fill={"currentColor"}>
                {formatPickupDate(payload.value)}
            </text>
            {marker !== undefined && (
                <text
                    dy={26}
                    textAnchor={"middle"}
                    fontSize={11}
                    fontStyle={"italic"}
                    className={
                        day?.isCalledOff ? "fill-red-600 dark:fill-red-400" : "fill-amber-600 dark:fill-amber-400"
                    }
                >
                    {marker}
                </text>
            )}
        </g>
    );
}

/** The properties of {@link PickupDayChart} */
export type PickupDayChartProps = {
    /** The pickup days */
    days: PickupDayPoint[];
    /** The selected Items */
    series: ItemSeries[];
    /** The measure */
    measure: Measure;
};

/**
 * What was ordered per pickup day, with open and Called Off days marked
 *
 * @returns the chart card
 */
export function PickupDayChart(props: PickupDayChartProps) {
    const { days, series, measure } = props;
    const [t] = useTranslation("statistics");

    const options = {
        series,
        measure,
        totalLabel: t("label.orders-total"),
        cancelled: { cancelled: t("label.cancelled"), calledOff: t("label.called-off") },
        opacity: days.map((day) => (day.open ? OPEN_OPACITY : 1)),
    };

    return (
        <ChartCard
            title={t("heading.pickup-days")}
            hint={t("description.pickup-days")}
            footer={
                <SeriesLegend
                    entries={measureLegend(options)}
                    note={measure === "orders" ? t("description.orders-not-stacked") : undefined}
                />
            }
        >
            <ComposedChart data={days} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={"currentColor"} strokeOpacity={0.15} />
                <XAxis
                    dataKey={"date"}
                    height={40}
                    tickLine={false}
                    axisLine={false}
                    interval={"preserveStartEnd"}
                    minTickGap={16}
                    tick={
                        <PickupDayTick
                            days={days}
                            openLabel={t("label.day-open")}
                            calledOffLabel={t("label.day-called-off")}
                        />
                    }
                />
                <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(value: number) => formatAxis(value, measure)}
                    tick={{ fill: "currentColor", fontSize: 12 }}
                />
                <Tooltip
                    cursor={{ fill: "currentColor", fillOpacity: 0.08 }}
                    content={
                        <StatisticsTooltip
                            measure={measure}
                            formatLabel={(label) => {
                                const day = days.find((candidate) => candidate.date === label);
                                const date = formatPickupDate(String(label));
                                if (day?.isCalledOff) return `${date} (${t("label.day-called-off")})`;
                                if (day?.open) return `${date} (${t("label.day-open")})`;
                                return date;
                            }}
                        />
                    }
                />
                {renderMeasureSeries(options)}
            </ComposedChart>
        </ChartCard>
    );
}
