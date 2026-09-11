import clsx from "clsx";
import { useTranslation } from "react-i18next";

/**
 * How the figure is drawn
 *
 * `meter` is the standalone block a page leads with — figure, the seats still free beside it, and
 * a bar under both. `inline` is the same numbers as one line, for a toolbar where a progress bar
 * would be decoration and a row of its own would break the line the labels sit on.
 */
export type TournamentSlotsVariant = "meter" | "inline";

/**
 * The properties for {@link TournamentSlots}
 */
export type TournamentSlotsProps = {
    /** How many people are on the roster */
    count: number;
    /** How many fit, `null`/`undefined` for an event that turns nobody away */
    max: number | null | undefined;
    /** How the figure is drawn, {@link TournamentSlotsVariant} */
    variant?: TournamentSlotsVariant;
    /** Extra classes for the wrapper */
    className?: string;
    /** Renders the figure at display size, for the beamer screen */
    large?: boolean;
};

/**
 * How full the room is: the figure, and — in the `meter` variant — a bar under it.
 *
 * The one number every surface leads with. An organizer reading their own bar, a stranger on the
 * share link and the projector in the corner all want "is there still room", and none of them
 * needs a name to answer it. Without a limit there is no meter to draw, only the count.
 *
 * @returns the figure in the shape its variant asks for
 */
export function TournamentSlots({ count, max, variant = "meter", className, large = false }: TournamentSlotsProps) {
    const [t] = useTranslation("tournament");

    const figure = clsx(
        "font-semibold text-zinc-950 tabular-nums dark:text-white",
        large ? "text-3xl" : variant === "inline" ? "text-2xl/8" : "text-xl",
    );
    const note = clsx("text-zinc-500 dark:text-zinc-400", large ? "text-base" : "text-xs");

    if (max == null) {
        return (
            <div className={clsx(className, "flex flex-col")}>
                <span className={figure}>{t("label.players", { count })}</span>
            </div>
        );
    }

    const free = Math.max(0, max - count);
    const freeLabel = free === 0 ? t("label.slots-full") : t("label.slots-free", { count: free });

    // One line, no bar: in a toolbar the ratio is the whole message, and a second row would pull
    // this block out of line with the code beside it.
    if (variant === "inline") {
        return (
            <div className={clsx(className, "flex flex-wrap items-baseline gap-x-2")}>
                <span className={figure}>{t("label.slots", { count, max })}</span>
                <span className={note}>{freeLabel}</span>
            </div>
        );
    }

    const taken = Math.min(100, Math.round((count / max) * 100));

    return (
        <div className={clsx(className, "flex flex-col gap-2")}>
            <div className={"flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"}>
                <span className={figure}>{t("label.slots", { count, max })}</span>
                <span className={note}>{freeLabel}</span>
            </div>
            {/* A meter, not a progress bar: the track is the room's capacity and the fill is how
                much of it is spoken for. Amber once nothing is left — the same colour the roster
                already uses for a state that wants attention without being an error. */}
            <div className={"h-2 overflow-hidden rounded-(--radius-pill) bg-zinc-950/10 dark:bg-white/10"}>
                <div
                    className={clsx(
                        "h-full rounded-(--radius-pill)",
                        free === 0 ? "bg-amber-500" : "bg-(--color-accent)",
                    )}
                    style={{ width: `${taken}%` }}
                />
            </div>
        </div>
    );
}
