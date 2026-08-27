import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * The properties for {@link MarkerButton}
 */
export type MarkerButtonProps = {
    /** What picking this does, for screen readers */
    label: string;
    /** Whether this is what the collection wears */
    selected: boolean;
    /** Picks it */
    onClick: () => void;
    /** The marker it shows */
    children: ReactNode;
};

/**
 * One swatch in the colour or icon row
 *
 * @returns the button
 */
export function MarkerButton({ label, selected, onClick, children }: MarkerButtonProps) {
    return (
        <button
            type={"button"}
            aria-label={label}
            aria-pressed={selected}
            onClick={onClick}
            className={clsx(
                "rounded-full transition",
                selected
                    ? "ring-2 ring-zinc-950 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900"
                    : "hover:opacity-75",
            )}
        >
            {children}
        </button>
    );
}
