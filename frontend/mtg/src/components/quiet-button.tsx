import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * The properties for {@link QuietButton}
 */
export type QuietButtonProps = {
    /** The label, and an icon before it where one helps */
    children: ReactNode;
    /** What the click does */
    onClick: () => void;
    /** An accessible name, where the label alone is not one */
    title?: string;
    /** Classes for placement, never for colour */
    className?: string;
};

/**
 * A small secondary action that sits beside a heading without competing with it.
 *
 * The advisor grew a handful of these — reset this target, reset the curve,
 * say what the deck plays — and each had been drawn its own way: a bare icon,
 * an underlined link, an icon with text. Three weights for three actions of
 * exactly the same importance reads as three different kinds of thing. This
 * is the one shape for all of them: a pill that is quiet at rest and only
 * gains a surface under the pointer.
 *
 * @returns the button
 */
export function QuietButton({ children, onClick, title, className }: QuietButtonProps) {
    return (
        <button
            type={"button"}
            onClick={onClick}
            title={title}
            className={clsx(
                "flex items-center gap-1 rounded-(--radius-pill) px-2 py-1 text-xs/5 font-medium text-zinc-500",
                "ring-1 ring-zinc-950/10 transition hover:bg-zinc-950/5 hover:text-zinc-950",
                "dark:text-zinc-400 dark:ring-white/15 dark:hover:bg-white/10 dark:hover:text-white",
                className,
            )}
        >
            {children}
        </button>
    );
}
