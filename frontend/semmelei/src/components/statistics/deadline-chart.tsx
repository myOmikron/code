import React from "react";
import { useTranslation } from "react-i18next";
import { XAxis } from "recharts";
import { ChartCard } from "src/components/statistics/chart-card";
import { ItemSeries } from "src/components/statistics/series";
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

    const bucketLabel = (bucket: string) => t(`label.distance-${bucket}`);

    return (
        <ChartCard
            title={t("heading.deadline-distance")}
            hint={t("description.deadline-distance")}
            data={buckets}
            series={series}
            measure={measure}
            formatLabel={(label) => bucketLabel(String(label))}
            xAxis={
                <XAxis
                    dataKey={"bucket"}
                    tickFormatter={bucketLabel}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    tick={{ fill: "currentColor", fontSize: 12 }}
                />
            }
        />
    );
}
