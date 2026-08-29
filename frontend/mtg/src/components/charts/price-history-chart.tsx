import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "src/components/charts/chart-card";
import type { PricePoint } from "src/utils/price-history";

/**
 * The properties for {@link PriceHistoryChart}
 */
export type PriceHistoryChartProps = {
    /** The days, oldest first */
    data: Array<PricePoint>;
    /** Label for the cheapest-offer series */
    lowName: string;
    /** Label for the trend series */
    trendName: string;
    /** The cheapest the card has been, drawn as a floor */
    low?: number | null;
    /** Label for that line */
    lowMarkName?: string;
    /** Renders a day for the axis and the tooltip */
    formatDay: (day: string) => string;
    /** Renders a euro amount */
    formatValue: (value: number) => string;
};

/**
 * What a card has cost, day by day.
 *
 * Two series that mean different things and are drawn to look it. The cheapest
 * offer is the filled one, because it is the number somebody watching a card is
 * actually waiting on; the trend price is a thin line behind it, the slower
 * truth the offer swings around. Reading them together is the point: an offer
 * far below a flat trend is somebody underselling, and an offer tracking a
 * rising trend is a card that is simply getting dearer.
 *
 * Plotted against the day as a category, not as time. The history is thinned as
 * it ages — daily inside a quarter, weekly before that — so the spacing is
 * deliberately even: a chart that spaced the old points three months apart would
 * squeeze the part being read into the last fifth of the width.
 *
 * A gap in either series is a day nobody offered the card, and is drawn as a
 * gap rather than as a line across it.
 *
 * A `ComposedChart` rather than an `AreaChart`, because the two series are
 * drawn with two different marks. An `AreaChart` does not register a `Line`
 * among its graphical items, and the mismatch surfaces as a React hook error
 * rather than as a missing line.
 *
 * @returns the chart
 */
export function PriceHistoryChart({
    data,
    lowName,
    trendName,
    low,
    lowMarkName,
    formatDay,
    formatValue,
}: PriceHistoryChartProps) {
    return (
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
                <linearGradient id={"price-history-low"} x1={"0"} y1={"0"} x2={"0"} y2={"1"}>
                    <stop offset={"0%"} stopColor={"#6366f1"} stopOpacity={0.45} />
                    <stop offset={"100%"} stopColor={"#6366f1"} stopOpacity={0.03} />
                </linearGradient>
            </defs>
            <CartesianGrid stroke={"currentColor"} strokeOpacity={0.15} vertical={false} />
            <XAxis
                dataKey={"day"}
                tickFormatter={formatDay}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(value: number) => formatValue(value)}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <Tooltip
                content={
                    <ChartTooltip
                        labelOf={(entry) => formatDay(String(entry?.payload?.day ?? ""))}
                        format={(value, name) => `${formatValue(value)} ${name}`}
                    />
                }
            />
            {low != null && (
                <ReferenceLine
                    y={low}
                    stroke={"currentColor"}
                    strokeOpacity={0.4}
                    strokeDasharray={"4 4"}
                    label={
                        lowMarkName === undefined
                            ? undefined
                            : {
                                  value: lowMarkName,
                                  position: "insideBottomLeft",
                                  fill: "currentColor",
                                  fontSize: 11,
                              }
                    }
                />
            )}
            <Area
                type={"monotone"}
                dataKey={"low"}
                name={lowName}
                stroke={"#6366f1"}
                strokeWidth={2}
                fill={"url(#price-history-low)"}
                connectNulls={false}
                isAnimationActive={false}
            />
            <Line
                type={"monotone"}
                dataKey={"trend"}
                name={trendName}
                stroke={"#d946ef"}
                strokeWidth={1.5}
                strokeDasharray={"5 3"}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
            />
        </ComposedChart>
    );
}
