import React from "react";
import { ResponsiveContainer } from "recharts";

/**
 * The properties for {@link ChartCard}
 */
export type ChartCardProps = {
    /** The heading above the chart */
    title: string;
    /** A line explaining what is being counted, when that is not obvious */
    hint?: string;
    /** Height of the plotting area in pixels */
    height?: number;
    /** Something to show in the header's right-hand corner */
    action?: React.ReactNode;
    /** Additional CSS classes for the card */
    className?: string;
    /** Exactly one recharts chart */
    children: React.ReactElement;
};

/**
 * The surface every chart sits on: heading, optional hint, and a sized box.
 *
 * The box carries a text colour rather than the chart doing so, which is what
 * lets the axes and grids be drawn in `currentColor` and follow the theme —
 * an svg fill has no dark-mode variant of its own.
 *
 * @returns the card
 */
export function ChartCard({ title, hint, height = 260, action, className, children }: ChartCardProps) {
    return (
        <div
            className={`flex flex-col rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10 ${className ?? ""}`}
        >
            <div className={"flex items-start justify-between gap-4"}>
                <div className={"min-w-0"}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{title}</h3>
                    {hint !== undefined && (
                        <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{hint}</p>
                    )}
                </div>
                {action}
            </div>
            <div className={"mt-4 text-zinc-400 dark:text-zinc-500"} style={{ height }}>
                <ResponsiveContainer width={"100%"} height={"100%"}>
                    {children}
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/** One line of a {@link ChartTooltip}, as recharts hands it over */
export type TooltipEntry = {
    /** The series name */
    name?: string | number;
    /** The value at the hovered position */
    value?: number | string;
    /** The colour the series is drawn in */
    color?: string;
    /** The whole datum behind the point */
    payload?: Record<string, unknown>;
};

/**
 * The properties for {@link ChartTooltip}
 */
export type ChartTooltipProps = {
    /** Whether the pointer is over the chart — set by recharts */
    active?: boolean;
    /** The hovered series values — set by recharts */
    payload?: TooltipEntry[];
    /** The hovered category — set by recharts */
    label?: string | number;
    /** Renders the heading, defaults to the raw label */
    labelOf?: (entry: TooltipEntry | undefined) => string;
    /** Renders a value, defaults to its plain string form */
    format?: (value: number, name: string) => string;
};

/**
 * A tooltip that follows the app's theme instead of recharts' white default.
 *
 * @returns the tooltip, or nothing while the pointer is elsewhere
 */
export function ChartTooltip({ active, payload, label, labelOf, format }: ChartTooltipProps) {
    if (active !== true || payload === undefined || payload.length === 0) return null;

    const heading = labelOf !== undefined ? labelOf(payload[0]) : String(label ?? "");

    return (
        <div
            className={
                "rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10"
            }
        >
            {heading !== "" && <p className={"font-semibold text-zinc-950 dark:text-white"}>{heading}</p>}
            {payload.map((entry, index) => (
                <p key={index} className={"mt-1 flex items-center gap-2 text-zinc-600 dark:text-zinc-300"}>
                    <span className={"size-2 shrink-0 rounded-full"} style={{ backgroundColor: entry.color }} />
                    <span>
                        {typeof entry.value === "number" && format !== undefined
                            ? format(entry.value, String(entry.name ?? ""))
                            : String(entry.value ?? "")}
                    </span>
                </p>
            ))}
        </div>
    );
}
