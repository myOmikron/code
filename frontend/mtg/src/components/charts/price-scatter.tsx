import { CartesianGrid, Cell, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ChartTooltip } from "src/components/charts/chart-card";

/** One stack in the comparison */
export type PriceDatum = {
    /** The card's name */
    name: string;
    /** What was paid per copy */
    purchase: number;
    /** What one copy fetches today */
    market: number;
    /** How many copies */
    copies: number;
};

/**
 * The properties for {@link PriceScatter}
 */
export type PriceScatterProps = {
    /** The stacks that recorded a purchase price */
    data: PriceDatum[];
    /** Axis caption for what was paid */
    purchaseName: string;
    /** Axis caption for what it is worth */
    marketName: string;
    /** Renders a euro amount */
    formatValue: (value: number) => string;
};

/**
 * Paid against worth, one dot per stack.
 *
 * The diagonal is break-even: everything above it gained, everything below it
 * lost. That line is the whole chart — without it a scatter of two prices says
 * nothing, and with it every dot places itself.
 *
 * Dot size follows the number of copies, so a bad buy repeated four times looks
 * as heavy as it was.
 *
 * @returns the chart
 */
export function PriceScatter({ data, purchaseName, marketName, formatValue }: PriceScatterProps) {
    const limit = data.reduce((highest, point) => Math.max(highest, point.purchase, point.market), 0) * 1.1;

    return (
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={"currentColor"} strokeOpacity={0.15} />
            <XAxis
                type={"number"}
                dataKey={"purchase"}
                name={purchaseName}
                domain={[0, limit]}
                tickFormatter={(value: number) => formatValue(value)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", fontSize: 11 }}
            />
            <YAxis
                type={"number"}
                dataKey={"market"}
                name={marketName}
                domain={[0, limit]}
                width={56}
                tickFormatter={(value: number) => formatValue(value)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", fontSize: 11 }}
            />
            <ZAxis type={"number"} dataKey={"copies"} range={[40, 260]} />
            <ReferenceLine
                segment={[
                    { x: 0, y: 0 },
                    { x: limit, y: limit },
                ]}
                stroke={"currentColor"}
                strokeDasharray={"4 4"}
                strokeOpacity={0.6}
            />
            <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={
                    <ChartTooltip
                        labelOf={(entry) => String(entry?.payload?.name ?? "")}
                        format={(value, name) => `${name}: ${formatValue(value)}`}
                    />
                }
            />
            <Scatter data={data} isAnimationActive={false}>
                {data.map((point, index) => (
                    // Green above the line, red below — the same reading as the
                    // condition badges, so the colour needs no legend.
                    <Cell key={index} fill={point.market >= point.purchase ? "#10b981" : "#ef4444"} fillOpacity={0.7} />
                ))}
            </Scatter>
        </ScatterChart>
    );
}
