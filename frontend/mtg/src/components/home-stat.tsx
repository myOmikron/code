import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * The properties for {@link HomeStat}
 */
export type HomeStatProps = {
    /** Where the tile leads */
    to: "/decks" | "/collections" | "/watch-lists";
    /** The pictogram in front of the label */
    icon: ReactNode;
    /** What is being counted */
    label: string;
    /** The figure itself */
    value: ReactNode;
    /** Whether the figure is one to act on, which colours it */
    alarming?: boolean;
};

/**
 * One number of the dashboard's headline strip.
 *
 * A link rather than a figure: every number here is the front of a section, and
 * a dashboard whose numbers cannot be followed is a poster.
 *
 * @returns the tile
 */
export function HomeStat({ to, icon, label, value, alarming = false }: HomeStatProps) {
    return (
        <Link
            to={to}
            className={"flex flex-col gap-1 bg-(--surface-card) p-4 transition hover:bg-(--surface-muted) sm:p-5"}
        >
            <span className={"flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"}>
                <span className={"[&>svg]:size-4"}>{icon}</span>
                <span className={"truncate"}>{label}</span>
            </span>
            <span
                className={
                    alarming
                        ? "text-xl font-semibold text-(--color-warning) tabular-nums"
                        : "text-xl font-semibold text-zinc-950 tabular-nums dark:text-white"
                }
            >
                {value}
            </span>
        </Link>
    );
}
