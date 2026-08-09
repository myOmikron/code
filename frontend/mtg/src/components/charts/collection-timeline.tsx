import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "src/components/charts/chart-card";

/** One month of the timeline */
export type TimelineDatum = {
    /** The month as `YYYY-MM` */
    month: string;
    /** Copies owned by the end of it */
    cards: number;
    /** What those are worth today */
    value: number;
};

/**
 * The properties for {@link CollectionTimeline}
 */
export type CollectionTimelineProps = {
    /** The months, oldest first */
    data: TimelineDatum[];
    /** Label for the card count series */
    cardsName: string;
    /** Label for the value series */
    valueName: string;
    /** Renders a month for the axis and the tooltip */
    formatMonth: (month: string) => string;
    /** Renders a euro amount */
    formatValue: (value: number) => string;
};

/**
 * How the collection grew: copies and today's value, side by side over time.
 *
 * Two axes, because the two series share a shape but not a scale. The value
 * line is deliberately drawn against *current* prices rather than the prices of
 * the day — this is "what I own now, and when it arrived", not a portfolio
 * chart, and the collection does not store historical prices to draw one.
 *
 * @returns the chart
 */
export function CollectionTimeline({ data, cardsName, valueName, formatMonth, formatValue }: CollectionTimelineProps) {
    return (
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
                <linearGradient id={"timeline-cards"} x1={"0"} y1={"0"} x2={"0"} y2={"1"}>
                    <stop offset={"0%"} stopColor={"#6366f1"} stopOpacity={0.5} />
                    <stop offset={"100%"} stopColor={"#6366f1"} stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id={"timeline-value"} x1={"0"} y1={"0"} x2={"0"} y2={"1"}>
                    <stop offset={"0%"} stopColor={"#d946ef"} stopOpacity={0.4} />
                    <stop offset={"100%"} stopColor={"#d946ef"} stopOpacity={0.03} />
                </linearGradient>
            </defs>
            <CartesianGrid stroke={"currentColor"} strokeOpacity={0.15} vertical={false} />
            <XAxis
                dataKey={"month"}
                tickFormatter={formatMonth}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <YAxis
                yAxisId={"cards"}
                width={40}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <YAxis
                yAxisId={"value"}
                orientation={"right"}
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatValue(value)}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <Tooltip
                content={
                    <ChartTooltip
                        labelOf={(entry) => formatMonth(String(entry?.payload?.month ?? ""))}
                        format={(value, name) => (name === valueName ? formatValue(value) : `${value} ${name}`)}
                    />
                }
            />
            <Area
                yAxisId={"cards"}
                type={"monotone"}
                dataKey={"cards"}
                name={cardsName}
                stroke={"#6366f1"}
                strokeWidth={2}
                fill={"url(#timeline-cards)"}
                isAnimationActive={false}
            />
            <Area
                yAxisId={"value"}
                type={"monotone"}
                dataKey={"value"}
                name={valueName}
                stroke={"#d946ef"}
                strokeWidth={2}
                fill={"url(#timeline-value)"}
                isAnimationActive={false}
            />
        </AreaChart>
    );
}
