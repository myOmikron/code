import React from "react";
import { ResponsiveContainer } from "recharts";
import { Subheading, Text } from "components";

/** The properties of {@link ChartCard} */
export type ChartCardProps = {
    /** Heading above the chart */
    title: string;
    /** A line explaining what is counted */
    hint?: string;
    /** Controls in the header's right corner */
    action?: React.ReactNode;
    /** Height of the plotting area in pixels */
    height?: number;
    /** Content below the chart, e.g. a legend of markers */
    footer?: React.ReactNode;
    /** Exactly one recharts chart */
    children: React.ReactElement;
};

/**
 * The surface a statistics chart sits on
 *
 * The plotting area carries a text colour so that axes and grid can be drawn in `currentColor`
 * and follow dark mode.
 *
 * @returns the card
 */
export function ChartCard(props: ChartCardProps) {
    const { title, hint, action, height = 280, footer, children } = props;

    return (
        <section
            className={
                "flex min-w-0 flex-col gap-4 rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 sm:p-5 dark:ring-white/10"
            }
        >
            <div className={"flex flex-wrap items-start justify-between gap-3"}>
                <div className={"min-w-0"}>
                    <Subheading>{title}</Subheading>
                    {hint !== undefined && <Text className={"mt-0.5 text-xs/5!"}>{hint}</Text>}
                </div>
                {action}
            </div>
            <div className={"text-zinc-500 dark:text-zinc-400"} style={{ height }}>
                <ResponsiveContainer width={"100%"} height={"100%"}>
                    {children}
                </ResponsiveContainer>
            </div>
            {footer}
        </section>
    );
}
