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
    /**
     * Leaves an opening instead of closing the ring.
     *
     * A closed ring has no beginning, which is fine for a split that has no
     * order — types, artists — and wrong for one that does. Rarity runs from
     * common to mythic, and an arc with a visible start and end is what makes
     * that direction readable.
     */
    arc?: boolean;
};

/**
 * A donut of how something splits.
 *
 * A donut rather than a pie: the hole is where the eye lands, and leaving it
 * empty is what keeps a chart with eight slices from reading as a colour wheel.
 *
 * @returns the chart
 */
export function SharePie({ data, format, arc = false }: SharePieProps) {
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
                // Three quarters of a turn, opening at the bottom: the first
                // slice starts upper left and the last ends upper right, so the
                // gap sits where the legend is and reads as the seam rather
                // than as missing data.
                startAngle={arc ? 225 : 0}
                endAngle={arc ? -45 : 360}
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
            {/* Drawn here rather than left to recharts, which orders the legend
                by name — a rarity split then climbs common to mythic around the
                ring while the legend below it reads common, mythic, rare,
                uncommon, and the two contradict each other. Its own `payload`
                prop would be the smaller fix, but recharts does not accept one.
                This renders straight from `slices`, so the legend cannot fall
                out of step with the sectors. */}
            <Legend
                verticalAlign={"bottom"}
                content={() => (
                    <ul className={"flex flex-wrap justify-center gap-x-4 gap-y-1"}>
                        {slices.map((slice, index) => (
                            <li key={slice.label} className={"flex items-center gap-1.5"}>
                                <span
                                    className={"size-2 shrink-0 rounded-full"}
                                    style={{ backgroundColor: slice.color ?? seriesColor(index) }}
                                />
                                <span className={"text-xs text-zinc-600 dark:text-zinc-300"}>{slice.label}</span>
                            </li>
                        ))}
                    </ul>
                )}
            />
        </PieChart>
    );
}
