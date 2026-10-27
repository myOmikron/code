import type { ReactNode } from "react";

/**
 * The row grid the cockpit's panels share: two columns from `md`, since one
 * row of handles across the whole width is a long way to drag
 */
export const PANEL_GRID = "grid gap-4 md:grid-cols-2 md:gap-x-10";

/**
 * The properties for {@link DeckAdvisorPanel}
 */
export type DeckAdvisorPanelProps = {
    /** What the panel counts */
    hint: string;
    /** Something to show in the header's right-hand corner */
    action?: ReactNode;
    /** The panel's body */
    children: ReactNode;
};

/**
 * One cockpit panel. Untitled: the tile that opened it has just said its name.
 *
 * @returns the panel
 */
export function DeckAdvisorPanel({ hint, action, children }: DeckAdvisorPanelProps) {
    return (
        <div
            className={
                "flex flex-col rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
            }
        >
            <div className={"flex items-start justify-between gap-4"}>
                <p className={"min-w-0 py-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{hint}</p>
                {action}
            </div>
            <div className={"mt-4 text-zinc-400 dark:text-zinc-500"}>{children}</div>
        </div>
    );
}
