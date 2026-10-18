import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { AdminStatisticsSnapshot } from "src/api/generated";
import { ChartTooltip } from "src/components/charts/chart-card";

/** A count of a Statistics snapshot that can be drawn over time */
export type StatisticsCount = "accounts" | "collections" | "decks" | "public_decks" | "cards" | "open_scanner_sessions";

/**
 * The properties for {@link StatisticsCurve}
 */
export type StatisticsCurveProps = {
    /** The snapshots, oldest first */
    snapshots: Array<AdminStatisticsSnapshot>;
    /** Which count to draw */
    count: StatisticsCount;
    /** Label of the series in the tooltip */
    name: string;
    /** Renders a snapshot's time for the axis */
    formatTick: (iso: string) => string;
    /** Renders a snapshot's time for the tooltip */
    formatTime: (iso: string) => string;
};

/**
 * One count of the Statistics snapshots over time, drawn like the collection timeline.
 *
 * @returns the chart
 */
export function StatisticsCurve({ snapshots, count, name, formatTick, formatTime }: StatisticsCurveProps) {
    const gradient = `statistics-${count}`;

    return (
        <AreaChart data={snapshots} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
                <linearGradient id={gradient} x1={"0"} y1={"0"} x2={"0"} y2={"1"}>
                    <stop offset={"0%"} stopColor={"#6366f1"} stopOpacity={0.5} />
                    <stop offset={"100%"} stopColor={"#6366f1"} stopOpacity={0.03} />
                </linearGradient>
            </defs>
            <CartesianGrid stroke={"currentColor"} strokeOpacity={0.15} vertical={false} />
            <XAxis
                dataKey={"taken_at"}
                tickFormatter={formatTick}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <YAxis
                width={48}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <Tooltip
                content={
                    <ChartTooltip
                        labelOf={(entry) => formatTime(String(entry?.payload?.taken_at ?? ""))}
                        format={(value) => `${value.toLocaleString("de-DE")} ${name}`}
                    />
                }
            />
            <Area
                type={"monotone"}
                dataKey={count}
                name={name}
                stroke={"#6366f1"}
                strokeWidth={2}
                fill={`url(#${gradient})`}
                isAnimationActive={false}
            />
        </AreaChart>
    );
}
