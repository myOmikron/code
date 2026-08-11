import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "src/components/charts/chart-card";
import { PipTick, PIP_AXIS_HEIGHT } from "src/components/charts/pip-tick";

/** One bar */
export type BarDatum = {
    /** What the bar is called on the axis */
    label: string;
    /** How high it goes */
    value: number;
    /** Its colour, defaulting to the chart's */
    color?: string;
    /**
     * The pip to draw in place of the label, as Scryfall spells it (`W`, `U`,
     * …). The label stays the name behind it, for the tooltip and for anyone
     * reading with a screen reader.
     */
    pip?: string;
};

/**
 * The properties for {@link BarDistribution}
 */
export type BarDistributionProps = {
    /** The bars, in the order they should appear */
    data: BarDatum[];
    /** `rows` lays the bars out left to right, which fits long labels */
    layout?: "columns" | "rows";
    /** The colour for bars that bring none of their own */
    color?: string;
    /** Renders a value for the tooltip */
    format?: (value: number) => string;
    /** Width reserved for row labels */
    labelWidth?: number;
    /** Whether to print the value at the end of each bar */
    showValues?: boolean;
};

/**
 * A bar per category, either standing up or lying down.
 *
 * Rows exist because half of what a collection splits by — artists, sets,
 * formats — has names too long to stand under a column without being turned
 * sideways and becoming unreadable.
 *
 * @returns the chart
 */
export function BarDistribution({
    data,
    layout = "columns",
    color = "#6366f1",
    format,
    labelWidth = 120,
    showValues = false,
}: BarDistributionProps) {
    const rows = layout === "rows";

    // Built once per render rather than searched per tick: recharts calls the
    // tick for every category, and the axis only knows the label it was given.
    const pips = new Map(data.filter((datum) => datum.pip !== undefined).map((datum) => [datum.label, datum.pip]));
    const pipOf = (label: string) => pips.get(label);

    return (
        <BarChart
            data={data}
            layout={rows ? "vertical" : "horizontal"}
            margin={{ top: 4, right: showValues ? 36 : 8, left: 0, bottom: 0 }}
        >
            {rows ? (
                <>
                    <XAxis type={"number"} hide={true} />
                    <YAxis
                        type={"category"}
                        dataKey={"label"}
                        width={labelWidth}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "currentColor", fontSize: 12 }}
                    />
                </>
            ) : (
                <>
                    <XAxis
                        dataKey={"label"}
                        tickLine={false}
                        axisLine={false}
                        height={pips.size > 0 ? PIP_AXIS_HEIGHT : undefined}
                        tick={pips.size > 0 ? <PipTick pipOf={pipOf} /> : { fill: "currentColor", fontSize: 12 }}
                    />
                    <YAxis
                        width={36}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "currentColor", fontSize: 12 }}
                        allowDecimals={false}
                    />
                </>
            )}
            <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.08 }}
                content={<ChartTooltip format={(value) => (format !== undefined ? format(value) : String(value))} />}
            />
            <Bar dataKey={"value"} fill={color} radius={rows ? [0, 4, 4, 0] : [4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((datum, index) => (
                    <Cell key={index} fill={datum.color ?? color} />
                ))}
                {showValues && (
                    <LabelList
                        dataKey={"value"}
                        position={rows ? "right" : "top"}
                        className={"fill-zinc-500 dark:fill-zinc-400"}
                        fontSize={11}
                    />
                )}
            </Bar>
        </BarChart>
    );
}
