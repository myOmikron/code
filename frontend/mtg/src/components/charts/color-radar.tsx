import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, Tooltip } from "recharts";
import { ChartTooltip } from "src/components/charts/chart-card";

/** One axis of the radar */
export type RadarDatum = {
    /** The axis label */
    label: string;
    /** How far out the shape reaches on it */
    value: number;
};

/**
 * The properties for {@link ColorRadar}
 */
export type ColorRadarProps = {
    /** The five colours, always all of them — a missing axis would deform the shape */
    data: RadarDatum[];
    /** The colour of the filled shape */
    stroke?: string;
    /** Renders a value for the tooltip */
    format?: (value: number) => string;
};

/**
 * The shape a collection's colours make.
 *
 * A radar rather than five bars: the point of this chart is the silhouette. A
 * collection that leans hard into two neighbouring colours looks different at a
 * glance from one spread evenly, and no bar chart shows that.
 *
 * @returns the chart
 */
export function ColorRadar({ data, stroke = "#6366f1", format }: ColorRadarProps) {
    return (
        <RadarChart data={data} outerRadius={"75%"}>
            <PolarGrid stroke={"currentColor"} strokeOpacity={0.25} />
            <PolarAngleAxis dataKey={"label"} tick={{ fill: "currentColor", fontSize: 12 }} />
            <PolarRadiusAxis tick={false} axisLine={false} />
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
