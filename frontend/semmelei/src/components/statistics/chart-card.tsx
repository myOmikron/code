import React from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Subheading, Text } from "components";
import {
    formatAxis,
    ItemSeries,
    measureLegend,
    MeasureSeriesOptions,
    renderMeasureSeries,
    StatisticsTooltip,
} from "src/components/statistics/series";
import { SeriesLegend } from "src/components/statistics/series-legend";
import { Measure } from "src/utils/statistics";

/** The properties of {@link ChartCard} */
export type ChartCardProps<T> = {
    /** Heading above the chart */
    title: string;
    /** A line explaining what is counted */
    hint: string;
    /** Controls in the header's right corner */
    action?: React.ReactNode;
    /** Height of the plotting area in pixels */
    height?: number;
    /** The chart points */
    data: T[];
    /** The selected Items */
    series: ItemSeries[];
    /** The measure */
    measure: Measure;
    /** Whether to draw the "storniert" and "abgesagt" series */
    withCancelled?: boolean;
    /** Opacity per chart point, to mark points whose numbers are not final */
    opacity?: number[];
    /** The chart's x axis */
    xAxis: React.ReactElement;
    /** Renders the tooltip heading from the hovered category */
    formatLabel: (label: string | number) => string;
    /** Further recharts elements, e.g. a brush */
    children?: React.ReactNode;
};

/**
 * A statistics chart of the selected Items in a measure, on its card with legend
 *
 * The plotting area carries a text colour so that axes and grid can be drawn in `currentColor`
 * and follow dark mode.
 *
 * @returns the card
 */
export function ChartCard<T>(props: ChartCardProps<T>) {
    const { title, hint, action, height = 280, data, series, measure, withCancelled, opacity, xAxis } = props;
    const [t] = useTranslation("statistics");

    const options: MeasureSeriesOptions = {
        series,
        measure,
        totalLabel: t("label.orders-total"),
        cancelled: withCancelled ? { cancelled: t("label.cancelled"), calledOff: t("label.called-off") } : undefined,
        opacity,
    };

    return (
        <section
            className={
                "flex min-w-0 flex-col gap-4 rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 sm:p-5 dark:ring-white/10"
            }
        >
            <div className={"flex flex-wrap items-start justify-between gap-3"}>
                <div className={"min-w-0"}>
                    <Subheading>{title}</Subheading>
                    <Text className={"mt-0.5 text-xs/5!"}>{hint}</Text>
                </div>
                {action}
            </div>
            <div className={"text-zinc-500 dark:text-zinc-400"} style={{ height }}>
                <ResponsiveContainer width={"100%"} height={"100%"}>
                    <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={"currentColor"} strokeOpacity={0.15} />
                        {xAxis}
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
                            content={<StatisticsTooltip measure={measure} formatLabel={props.formatLabel} />}
                        />
                        {renderMeasureSeries(options)}
                        {props.children}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <SeriesLegend
                entries={measureLegend(options)}
                note={measure === "orders" ? t("description.orders-not-stacked") : undefined}
            />
        </section>
    );
}
