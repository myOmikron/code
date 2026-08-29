import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, Tooltip } from "recharts";
import { ChartTooltip } from "src/components/charts/chart-card";
import { LabelTick } from "src/components/charts/label-tick";
import { PipTick } from "src/components/charts/pip-tick";

/** One axis of the radar */
export type RadarDatum = {
    /** The axis label */
    label: string;
    /** How far out the shape reaches on it */
    value: number;
    /** The pip to draw in place of the label, as Scryfall spells it */
    pip?: string;
};

/**
 * The properties for {@link ProfileRadar}
 */
export type ProfileRadarProps = {
    /**
     * The axes, in a fixed order the caller decides and documents: adjacency
     * is what gives the shape its lobes, so sorting per render would make two
     * radars incomparable. An axis at zero is drawn at the centre, never
     * dropped, for the same reason.
     */
    data: RadarDatum[];
    /** The colour of the filled shape */
    stroke?: string;
    /**
     * The radius scale the values are read against.
     *
     * Worth stating rather than leaving to the chart: values already
     * normalised to 0–1 need `[0, 1]`, or an inferred scale silently makes
     * "the strongest theme" mean something other than the full radius, and
     * the shape collapses toward the centre. Counts can keep the default.
     */
    domain?: [number, number | "auto"];
    /** Renders a value for the tooltip */
    format?: (value: number) => string;
    /**
     * How much of the box the shape may spend, leaving the rest to the axis
     * labels. The default suits a wide panel; a narrow column has to pull the
     * polygon in or the labels either side of it are cut in half.
     */
    radius?: string;
    /**
     * Reports which axis label is under the pointer, or `null` once it isn't.
     * Swaps the tick for {@link LabelTick}, so it only takes effect when no
     * axis carries a pip — the two tick styles are not meant to combine.
     */
    onAxisHover?: (label: string | null) => void;
};

/**
 * A profile across three or more named axes, drawn as one filled shape.
 *
 * A radar rather than a row of bars: the question it answers is "what shape
 * is this" — a specialist with one spike, or something that agrees across
 * many axes — and bars rank where a polygon characterises. Used for a
 * collection's colours, a deck's themes, and why one suggestion scored.
 *
 * It plots `value` in 0…1 and derives nothing: what 1.0 *means* — best in
 * batch, share of the strongest theme — is a product claim belonging to the
 * caller, and `src/utils/suggestion-radar.ts` is where the advisor's two make
 * theirs. One shape per chart: comparing two profiles is two charts side by
 * side, never two overlapping blobs, which hide whichever matters.
 *
 * @returns the chart
 */
export function ProfileRadar({
    data,
    stroke = "#6366f1",
    format,
    domain = [0, "auto"],
    radius = "75%",
    onAxisHover,
}: ProfileRadarProps) {
    const pips = new Map(data.filter((datum) => datum.pip !== undefined).map((datum) => [datum.label, datum.pip]));

    return (
        <RadarChart data={data} outerRadius={radius}>
            <PolarGrid stroke={"currentColor"} strokeOpacity={0.25} />
            <PolarAngleAxis
                dataKey={"label"}
                tick={
                    pips.size > 0 ? (
                        <PipTick pipOf={(label) => pips.get(label)} anchor={"angle"} />
                    ) : onAxisHover !== undefined ? (
                        <LabelTick onHover={onAxisHover} />
                    ) : (
                        { fill: "currentColor", fontSize: 12 }
                    )
                }
            />
            <PolarRadiusAxis tick={false} axisLine={false} domain={domain} />
            <Radar
                dataKey={"value"}
                stroke={stroke}
                fill={stroke}
                fillOpacity={0.35}
                isAnimationActive={false}
                dot={{ r: 3, fill: stroke }}
            />
            <Tooltip
                content={
                    <ChartTooltip
                        labelOf={(entry) => String(entry?.payload?.label ?? "")}
                        format={(value) => (format !== undefined ? format(value) : String(value))}
                    />
                }
            />
        </RadarChart>
    );
}
