import type { LinkProps } from "@tanstack/react-router";
import clsx from "clsx";
import { Link } from "components";
import type { ComponentType } from "react";

/** What every card wears, linked or not */
const CARD = "flex min-h-32 flex-col justify-between gap-4 rounded-(--radius-card) p-5";

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
};

/**
 * One tool on a launcher.
 *
 * The launcher is the one place a tool is picked, so the card carries
 * everything a new one needs: drop an entry next to the others and it is on the
 * grid, greyed out until it has a route to open.
 *
 * Drawn as the app's own card — white surface, hairline ring, the soft shadow
 * every other panel wears — with the one accent being the brand-tinted icon.
 * A grid of differently coloured cards read as a launcher from somewhere else.
 *
 * @returns the card
 */
export function GameToolCard({ to, icon: Icon, title, description }: GameToolCardProps) {
    const content = (
        <>
            <span
                className={clsx(
                    "flex size-9 items-center justify-center rounded-(--radius-control)",
                    to === undefined
                        ? "bg-zinc-950/5 text-zinc-400 dark:bg-white/10 dark:text-zinc-500"
                        : "bg-(--color-brand-500)/10 text-(--color-accent) dark:bg-(--color-brand-500)/15 dark:text-(--color-brand-300)",
                )}
            >
                <Icon className={"size-5"} />
            </span>
            <span>
                <strong
                    className={clsx(
                        "block font-medium",
                        to === undefined ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-950 dark:text-white",
                    )}
                >
                    {title}
                </strong>
                <span className={"mt-1 block text-sm text-zinc-500 dark:text-zinc-400"}>{description}</span>
            </span>
        </>
    );

    if (to === undefined) {
        return (
            <div className={clsx(CARD, "bg-(--surface-muted) ring-1 ring-zinc-950/5 dark:ring-white/10")}>
                {content}
            </div>
        );
    }

    return (
        <Link
            href={to}
            className={clsx(
                CARD,
                "bg-(--surface-card) shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 transition hover:shadow-(--shadow-card-md) hover:ring-2 hover:ring-(--color-brand-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-500) dark:ring-white/10",
            )}
        >
            {content}
        </Link>
    );
}
