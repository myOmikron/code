import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { InteractionGrid, InteractionRow } from "src/api/graph-generated";

/** The grid's own row and column order — the API's fixed vocabulary, not sorted */
const ROWS: ReadonlyArray<InteractionRow["row"]> = ["stack", "proactive_protection", "permanent_answer", "class_hate"];
const COLUMNS: ReadonlyArray<"free" | "cheap" | "held_up"> = ["free", "cheap", "held_up"];

/** class_hate's own subdivision keys (`interaction.py`'s `_CLASS_HATE_TAG_SLUGS` plus its two fixed fallbacks) */
const CLASSES: ReadonlyArray<string> = ["graveyard", "artifact", "ability", "other"];

/**
 * The properties for {@link DeckAdvisorInteractionGrid}
 */
export type DeckAdvisorInteractionGridProps = {
    /** `Diagnostics.interaction_grid` — null below bracket 5, but the route never mounts this panel there */
    grid: InteractionGrid;
};

/**
 * The cEDH interaction taxonomy as a real table: what answers the deck holds
 * against the stack, proactive protection, permanent answers and the named
 * hate classes, each broken into free / cheap / held-up.
 *
 * A `<table>` with real `<th>` headers rather than a div grid, per the task's
 * own accessibility requirement — row and column headers carry their
 * relationship natively instead of through visual position alone.
 *
 * Only `proactive_protection` at a flat zero gets the alarm treatment
 * (confirmed in the mockup's refinement round): every other cell is coloured
 * by the "free" column tint alone, because no threshold has been measured
 * for "too little" anywhere else on the grid — an invented severity scale
 * would be a judgement this panel has no data to back up.
 *
 * @returns the grid
 */
export function DeckAdvisorInteractionGrid({ grid }: DeckAdvisorInteractionGridProps) {
    const [t] = useTranslation("advisor");

    const byRow = new Map(grid.rows.map((row) => [row.row, row]));
    const rowLabel = (row: string) => t(`label.grid-row-${row.replace(/_/g, "-")}`, { defaultValue: row });
    const colLabel = (col: string) => t(`label.grid-col-${col.replace(/_/g, "-")}`, { defaultValue: col });

    const classHate = byRow.get("class_hate");
    const classEntries =
        classHate?.classes === null || classHate?.classes === undefined
            ? []
            : CLASSES.map((cls) => [cls, classHate.classes?.[cls] ?? []] as const).filter(
                  ([, names]) => names.length > 0,
              );

    return (
        <div className={"overflow-x-auto"}>
            <table className={"w-full min-w-[32rem] border-collapse text-left text-sm/6"}>
                <thead>
                    <tr>
                        <th scope={"col"} className={"border-b border-zinc-950/10 pb-2 dark:border-white/10"} />
                        {COLUMNS.map((col) => (
                            <th
                                key={col}
                                scope={"col"}
                                className={clsx(
                                    "border-b border-zinc-950/10 px-3 pb-2 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:text-zinc-400",
                                    col === "free" && "bg-(--color-accent)/5",
                                )}
                            >
                                {colLabel(col)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {ROWS.map((row) => {
                        const data = byRow.get(row);
                        const total = COLUMNS.reduce((sum, col) => sum + (data?.cells[col]?.count ?? 0), 0);
                        const alarm = row === "proactive_protection" && total === 0;
                        return (
                            <tr key={row}>
                                <th
                                    scope={"row"}
                                    className={
                                        "border-b border-zinc-950/5 py-2 pr-3 font-medium whitespace-nowrap text-zinc-950 dark:border-white/5 dark:text-white"
                                    }
                                >
                                    <span className={"flex items-center gap-2"}>
                                        {rowLabel(row)}
                                        {alarm && (
                                            <span
                                                className={
                                                    "rounded-(--radius-pill) bg-(--color-danger)/15 px-1.5 py-0.5 text-xs font-semibold text-(--color-danger)"
                                                }
                                            >
                                                {t("label.grid-alarm-zero")}
                                            </span>
                                        )}
                                    </span>
                                </th>
                                {COLUMNS.map((col) => {
                                    const cell = data?.cells[col];
                                    return (
                                        <td
                                            key={col}
                                            className={clsx(
                                                "border-b border-zinc-950/5 px-3 py-2 text-center align-top tabular-nums dark:border-white/5",
                                                col === "free" && "bg-(--color-accent)/5",
                                                alarm && "bg-(--color-danger)/10",
                                            )}
                                        >
                                            <div
                                                className={clsx(
                                                    "text-sm font-semibold",
                                                    (cell?.count ?? 0) === 0
                                                        ? "text-zinc-400 dark:text-zinc-600"
                                                        : "text-zinc-950 dark:text-white",
                                                )}
                                            >
                                                {cell?.count ?? 0}
                                            </div>
                                            {(cell?.cards?.length ?? 0) > 0 && (
                                                <div
                                                    className={"mt-0.5 text-xs text-zinc-500 dark:text-zinc-400"}
                                                    title={cell?.cards?.join(", ")}
                                                >
                                                    {cell?.cards?.join(", ")}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {classEntries.length > 0 && (
                <p className={"mt-2 text-xs text-zinc-500 dark:text-zinc-400"}>
                    {t("label.grid-class-hate-breakdown", {
                        list: classEntries
                            .map(([cls, names]) => `${t(`label.class-hate-${cls}`)}: ${names.join(", ")}`)
                            .join(" · "),
                    })}
                </p>
            )}
        </div>
    );
}
