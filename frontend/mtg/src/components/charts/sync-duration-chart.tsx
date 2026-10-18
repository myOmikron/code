import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "src/components/charts/chart-card";

/** One Sync run in the chart */
export type SyncDurationDatum = {
    /** When the run started, ISO timestamp */
    started_at: string;
    /** How long it took, in milliseconds */
    duration_ms: number;
    /** What it came to, already translated */
    outcome: string;
};

/**
 * The properties for {@link SyncDurationChart}
 */
export type SyncDurationChartProps = {
    /** The runs, oldest first */
    data: Array<SyncDurationDatum>;
    /** Label of the duration series */
    durationName: string;
    /** Renders a start time for the axis */
    formatTick: (iso: string) => string;
    /** Renders a start time for the tooltip */
    formatStart: (iso: string) => string;
    /** Renders a duration */
    formatDuration: (ms: number) => string;
};

/**
 * How long the recent Sync runs of one sync took, one bar per run, oldest on the left.
 *
 * @returns the chart
 */
export function SyncDurationChart({
    data,
    durationName,
    formatTick,
    formatStart,
    formatDuration,
}: SyncDurationChartProps) {
    return (
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={"currentColor"} strokeOpacity={0.15} vertical={false} />
            <XAxis
                dataKey={"started_at"}
                tickFormatter={formatTick}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={(ms: number) => formatDuration(ms)}
                tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.08 }}
                content={
                    <ChartTooltip
                        labelOf={(entry) =>
                            `${formatStart(String(entry?.payload?.started_at ?? ""))}, ${String(entry?.payload?.outcome ?? "")}`
                        }
                        format={(value) => formatDuration(value)}
                    />
                }
            />
            <Bar
                dataKey={"duration_ms"}
                name={durationName}
                fill={"#6366f1"}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
            />
        </BarChart>
    );
}
