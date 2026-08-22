import type { LinkProps } from "@tanstack/react-router";
import clsx from "clsx";
import { Link } from "components";
import type { ComponentType } from "react";

/** What every card wears, linked or not */
const CARD = "flex min-h-36 flex-col justify-between gap-4 rounded-(--radius-card) p-5";

/**
 * The properties for {@link GameToolCard}
 */
export type GameToolCardProps = {
    /** The tool's route, absent while it is still being built */
    to?: LinkProps["to"];
    /** The icon the card wears */
    icon: ComponentType<{ className?: string }>;
    /** What the tool is called */
    title: string;
    /** What it does, in a line */
    description: string;
    /** The gradient a finished tool wears */
    color?: string;
};

/**
 * One tool on the launcher.
 *
 * The launcher is the one place a table tool is picked, so the card carries
 * everything a new tool needs: drop an entry next to the others and it is on
 * the grid, greyed out until it has a route to open.
 *
 * @returns the card
 */
export function GameToolCard({ to, icon: Icon, title, description, color }: GameToolCardProps) {
    const content = (
        <>
            <Icon className={"size-8 opacity-85"} />
            <span>
                <strong className={"block text-lg"}>{title}</strong>
                <span className={"mt-1 block text-sm opacity-75"}>{description}</span>
            </span>
        </>
    );

    if (to === undefined) {
        return (
            <div
                className={clsx(
                    CARD,
                    "bg-zinc-950/5 text-zinc-500 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:text-zinc-400 dark:ring-white/10",
                )}
            >
                {content}
            </div>
        );
    }

    return (
        <Link
            href={to}
            className={clsx(
                CARD,
                "bg-linear-to-br text-white shadow-(--shadow-card-md) ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:shadow-(--shadow-card-lg) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-500)",
                color,
            )}
        >
            {content}
        </Link>
    );
}
