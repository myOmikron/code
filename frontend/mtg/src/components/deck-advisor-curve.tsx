import { Bar, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { CurveBucket } from "src/api/graph-generated";
import { ChartTooltip } from "src/components/charts/chart-card";

/**
 * The properties for {@link DeckAdvisorCurve}
 */
export type DeckAdvisorCurveProps = {
    /** The curve as the advisor reports it, counts and targets per mana value */
    curve: Array<CurveBucket>;
};

/**
 * The deck's mana curve against the advisor's target curve.
 *
 * The counts are bars in the chart colour; the target is a stepped line in
 * `currentColor`, which keeps it recessive and theme-following — it is the
 * reference, not the data. The hosting card's hint names both series, so
 * their identity never hangs on colour alone.
 *
 * @returns the chart, sized by the {@link ChartCard} it sits in
 */
export function DeckAdvisorCurve({ curve }: DeckAdvisorCurveProps) {
    const [t] = useTranslation("advisor");
    const last = curve.length - 1;
    const data = curve.map((bucket, index) => ({
        label: index === last ? `${bucket.mv}+` : String(bucket.mv),
        count: bucket.count,
        target: bucket.target,
    }));

    return (
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey={"label"} tickLine={false} axisLine={false} tick={{ fill: "currentColor", fontSize: 12 }} />
            <YAxis
                width={36}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
                allowDecimals={false}
            />
            <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.08 }}
                content={
                    <ChartTooltip format={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))} />
                }
            />
            <Bar
                dataKey={"count"}
                name={t("label.curve-cards")}
                fill={"#6366f1"}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
            />
            <Line
                dataKey={"target"}
                name={t("label.curve-target")}
                type={"stepAfter"}
                stroke={"currentColor"}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
            />
        </ComposedChart>
    );
}
