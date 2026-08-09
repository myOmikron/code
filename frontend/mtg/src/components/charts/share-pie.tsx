import { Cell, Legend, Pie, PieChart, Tooltip } from "recharts";
import { ChartTooltip } from "src/components/charts/chart-card";
import { seriesColor } from "src/components/charts/colors";

/** One slice */
export type PieDatum = {
    /** What the slice is called */
    label: string;
    /** Its size */
    value: number;
    /** Its colour, defaulting to the categorical palette */
    color?: string;
};

/**
 * The properties for {@link SharePie}
 */
export type SharePieProps = {
    /** The slices — zero-sized ones are dropped */
    data: PieDatum[];
    /** Renders a value for the tooltip */
    format?: (value: number) => string;
};

/**
 * A donut of how something splits.
 *
 * A donut rather than a pie: the hole is where the eye lands, and leaving it
 * empty is what keeps a chart with eight slices from reading as a colour wheel.
 *
 * @returns the chart
 */
export function SharePie({ data, format }: SharePieProps) {
    const slices = data.filter((datum) => datum.value > 0);
    const total = slices.reduce((sum, datum) => sum + datum.value, 0);

    return (
        <PieChart>
            <Pie
                data={slices}
                dataKey={"value"}
                nameKey={"label"}
                innerRadius={"55%"}
                outerRadius={"80%"}
                paddingAngle={2}
                stroke={"none"}
                isAnimationActive={false}
            >
                {slices.map((slice, index) => (
                    <Cell key={slice.label} fill={slice.color ?? seriesColor(index)} />
                ))}
            </Pie>
            <Tooltip
                content={
                    <ChartTooltip
                        labelOf={(entry) => String(entry?.payload?.label ?? "")}
                        format={(value) =>
                            `${format !== undefined ? format(value) : value} · ${Math.round((value / total) * 100)}%`
                        }
                    />
                }
            />
            <Legend
                verticalAlign={"bottom"}
                iconType={"circle"}
                iconSize={8}
                formatter={(value) => <span className={"text-xs text-zinc-600 dark:text-zinc-300"}>{value}</span>}
            />
        </PieChart>
    );
}
