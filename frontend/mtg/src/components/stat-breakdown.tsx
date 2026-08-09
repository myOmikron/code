import React from "react";

/** One line of a {@link StatBreakdown} */
export type BreakdownRow = {
    /** Stable identity of the row */
    key: string;
    /** What the row counts — plain text or a badge */
    label: React.ReactNode;
    /** How many cards fall into it */
    value: number;
};

/**
 * The properties for {@link StatBreakdown}
 */
export type StatBreakdownProps = {
    /** The heading above the rows */
    title: string;
    /** The rows, already in the order they should appear */
    rows: BreakdownRow[];
    /** Additional CSS classes for the card */
    className?: string;
};

/**
 * How a collection splits across one attribute, as a list of labelled bars.
 *
 * The bars are scaled against the largest row, not against the total: a
 * collection is usually lopsided — a few hundred commons against a handful of
 * mythics — and scaling by the total leaves every interesting row as an
 * invisible sliver. The share next to the count is what carries the absolute
 * meaning.
 *
 * Rows with a count of zero are dropped, so an attribute nobody in this
 * collection uses does not take up a line.
 *
 * @returns the card, or nothing when there is not a single card to split
 */
export function StatBreakdown({ title, rows, className }: StatBreakdownProps) {
    const present = rows.filter((row) => row.value > 0);
    const total = present.reduce((sum, row) => sum + row.value, 0);
    if (total === 0) return null;

    const max = present.reduce((highest, row) => Math.max(highest, row.value), 0);

    return (
        <div
            className={`rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10 ${className ?? ""}`}
        >
            <h3 className={"text-sm/6 font-medium text-zinc-600 dark:text-zinc-300"}>{title}</h3>
            <dl className={"mt-4 flex flex-col gap-3"}>
                {present.map((row) => (
                    <div key={row.key} className={"flex flex-col gap-1.5"}>
                        <div className={"flex items-center justify-between gap-4"}>
                            <dt className={"min-w-0 truncate text-sm/6 text-zinc-950 dark:text-white"}>{row.label}</dt>
                            <dd className={"shrink-0 text-sm/6 text-zinc-500 tabular-nums dark:text-zinc-400"}>
                                <span className={"font-semibold text-zinc-950 dark:text-white"}>{row.value}</span>{" "}
                                {Math.round((row.value / total) * 100)}%
                            </dd>
                        </div>
                        <div className={"h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-700"}>
                            <div
                                className={"h-1.5 rounded-full bg-(--color-brand-500)"}
                                style={{ width: `${(row.value / max) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}
            </dl>
        </div>
    );
}
