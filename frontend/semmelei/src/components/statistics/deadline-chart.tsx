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
import { DeadlineBucket, Measure } from "src/utils/statistics";

/** The properties of {@link DeadlineChart} */
export type DeadlineChartProps = {
    /** The histogram buckets */
    buckets: DeadlineBucket[];
    /** The selected Items */
    series: ItemSeries[];
    /** The measure */
    measure: Measure;
};

/**
 * Histogram of how long before the Deadline orders were placed
 *
 * @returns the chart card
 */
export function DeadlineChart(props: DeadlineChartProps) {
    const { buckets, series, measure } = props;
    const [t] = useTranslation("statistics");

    const options = { series, measure, totalLabel: t("label.orders-total") };
    const bucketLabel = (bucket: string) => t(`label.distance-${bucket}`);

    return (
        <ChartCard
            title={t("heading.deadline-distance")}
            hint={t("description.deadline-distance")}
            footer={
                <SeriesLegend
                    entries={measureLegend(options)}
                    note={measure === "orders" ? t("description.orders-not-stacked") : undefined}
                />
            }
        >
            <ComposedChart data={buckets} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={"currentColor"} strokeOpacity={0.15} />
                <XAxis
                    dataKey={"bucket"}
                    tickFormatter={bucketLabel}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    tick={{ fill: "currentColor", fontSize: 12 }}
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
                        <StatisticsTooltip measure={measure} formatLabel={(label) => bucketLabel(String(label))} />
                    }
                />
                {renderMeasureSeries(options)}
            </ComposedChart>
        </ChartCard>
    );
}
