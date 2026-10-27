import React from "react";
import { Bar, Cell, Line } from "recharts";
import { ChartValues, Measure } from "src/utils/statistics";
import { formatPrice } from "src/utils/price";
import { LegendEntry } from "src/components/statistics/series-legend";

/** Categorical colours of the selected Items, in the order slots are handed out */
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

/** How many Items the charts show at most, one per colour */
export const MAX_SERIES = SERIES_COLORS.length;

/** Colour of the "storniert" series */
export const CANCELLED_COLOR = "#a1a1aa";

/** Colour of the "abgesagt" series */
export const CALLED_OFF_COLOR = "#71717a";

/** Colour of the line of all orders, under the orders measure */
export const TOTAL_COLOR = "#52525b";

/** One selected Item as the charts draw it */
export type ItemSeries = {
    /** The Item's key */
    key: string;
    /** Its label */
    name: string;
    /** Its colour */
    color: string;
};

/**
 * The colour of a colour slot
 *
 * @param slot the slot, below {@link MAX_SERIES}
 *
 * @returns a hex colour
 */
export function seriesColor(slot: number): string {
    return SERIES_COLORS[slot % SERIES_COLORS.length];
}

const NUMBER = new Intl.NumberFormat("de-DE");
const EURO_AXIS = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/**
 * Format a value of a measure
 *
 * @param value the value, Order Value in euro cents
 * @param measure the measure
 *
 * @returns the formatted value
 */
export function formatMeasure(value: number, measure: Measure): string {
    return measure === "orderValue" ? formatPrice(value) : NUMBER.format(value);
}

/**
 * Format a value of a measure for an axis tick
 *
 * @param value the value, Order Value in euro cents
 * @param measure the measure
 *
 * @returns the formatted value, whole euros for Order Value
 */
export function formatAxis(value: number, measure: Measure): string {
    return measure === "orderValue" ? EURO_AXIS.format(value / 100) : NUMBER.format(value);
}

/** Options of {@link renderMeasureSeries} */
export type MeasureSeriesOptions = {
    /** The selected Items */
    series: ItemSeries[];
    /** The measure; under orders the Items are not stacked, since one order can contain several */
    measure: Measure;
    /** Label of the line of all orders */
    totalLabel: string;
    /** Labels of the cancelled series, left out when undefined */
    cancelled?: { cancelled: string; calledOff: string };
    /** Opacity per data point, to mark points whose numbers are not final */
    opacity?: number[];
};

/**
 * The bars (and, under orders, the total line) of the selected Items
 *
 * Under units and Order Value the Items stack up to their total. Under orders an order with
 * several selected Items counts for each of them, so the Items stand side by side and a line
 * shows the orders with at least one selected Item.
 *
 * @param options the series, measure and labels
 *
 * @returns the recharts elements
 */
export function renderMeasureSeries(options: MeasureSeriesOptions): React.ReactElement[] {
    const { series, measure, totalLabel, cancelled, opacity } = options;
    const stacked = measure !== "orders";
    const cells = (color: string) =>
        opacity?.map((value, index) => <Cell key={index} fill={color} fillOpacity={value} />);
    const elements = series.map((item) => (
        <Bar
            key={item.key}
            name={item.name}
            dataKey={(values: ChartValues) => values.items[item.key] ?? 0}
            stackId={stacked ? "items" : undefined}
            fill={item.color}
            isAnimationActive={false}
        >
            {cells(item.color)}
        </Bar>
    ));
    if (cancelled !== undefined) {
        elements.push(
            <Bar
                key={"cancelled"}
                name={cancelled.cancelled}
                dataKey={"cancelled"}
                stackId={"cancelled"}
                fill={CANCELLED_COLOR}
                isAnimationActive={false}
            />,
            <Bar
                key={"called-off"}
                name={cancelled.calledOff}
                dataKey={"calledOff"}
                stackId={"cancelled"}
                fill={CALLED_OFF_COLOR}
                isAnimationActive={false}
            />,
        );
    }
    if (!stacked) {
        elements.push(
            <Line
                key={"total"}
                name={totalLabel}
                dataKey={"total"}
                type={"monotone"}
                stroke={TOTAL_COLOR}
                strokeWidth={2}
                strokeDasharray={"4 3"}
                dot={false}
                isAnimationActive={false}
            />,
        );
    }
    return elements;
}

/**
 * The legend entries matching {@link renderMeasureSeries}
 *
 * @param options the same options
 *
 * @returns the entries
 */
export function measureLegend(options: MeasureSeriesOptions): LegendEntry[] {
    const { series, measure, totalLabel, cancelled } = options;
    const entries: LegendEntry[] = series.map(({ name, color }) => ({ name, color }));
    if (cancelled !== undefined) {
        entries.push(
            { name: cancelled.cancelled, color: CANCELLED_COLOR },
            { name: cancelled.calledOff, color: CALLED_OFF_COLOR },
        );
    }
    if (measure === "orders") entries.push({ name: totalLabel, color: TOTAL_COLOR, line: true });
    return entries;
}

/** One line of the tooltip, as recharts hands it over */
type TooltipEntry = {
    /** The series name */
    name?: string | number;
    /** The value at the hovered point */
    value?: number | string | (number | string)[];
    /** The series colour */
    color?: string;
};

/** The properties of {@link StatisticsTooltip} */
export type StatisticsTooltipProps = {
    /** Whether the pointer is over the chart, set by recharts */
    active?: boolean;
    /** The hovered series values, set by recharts */
    payload?: readonly TooltipEntry[];
    /** The hovered category, set by recharts */
    label?: string | number;
    /** The measure the values are in */
    measure: Measure;
    /** Renders the heading from the category */
    formatLabel?: (label: string | number) => string;
};

/**
 * Tooltip of the statistics charts, in the app's surfaces for light and dark mode
 *
 * @returns the tooltip, or nothing while the pointer is elsewhere
 */
export function StatisticsTooltip(props: StatisticsTooltipProps) {
    const { active, payload, label, measure, formatLabel } = props;
    if (!active || payload === undefined || payload.length === 0) return null;

    return (
        <div
            className={
                "rounded-lg bg-white px-3 py-2 text-xs/5 shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10"
            }
        >
            {label !== undefined && (
                <div className={"mb-1 font-medium text-zinc-950 dark:text-white"}>
                    {formatLabel ? formatLabel(label) : label}
                </div>
            )}
            {payload.map((entry, index) => (
                <div key={index} className={"flex items-center gap-2 text-zinc-600 dark:text-zinc-300"}>
                    <span className={"size-2.5 shrink-0 rounded-sm"} style={{ backgroundColor: entry.color }} />
                    <span className={"grow"}>{entry.name}</span>
                    <span className={"font-medium text-zinc-950 tabular-nums dark:text-white"}>
                        {typeof entry.value === "number" ? formatMeasure(entry.value, measure) : ""}
                    </span>
                </div>
            ))}
        </div>
    );
}
