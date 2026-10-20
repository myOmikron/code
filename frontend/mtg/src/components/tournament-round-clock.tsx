import { MinusIcon, PauseIcon, PlayIcon, PlusIcon } from "@heroicons/react/20/solid";
import { Badge } from "components";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { RoundClock } from "src/utils/round-clock";
import { formatDuration } from "src/utils/round-clock";
import { useRoundClock } from "src/utils/use-round-clock";

/** Below this many seconds the face turns amber */
const WARN_SECONDS = 5 * 60;

/** Below this many seconds it turns red */
const URGENT_SECONDS = 60;

/** How much a single tap on the plus or minus is worth, in seconds */
const NUDGE_SECONDS = 60;

/** How the clock is drawn: `inline` in a toolbar, or `display` for the projector, without controls */
export type RoundClockSize = "inline" | "display";

/** The properties for {@link TournamentRoundClock} */
export type TournamentRoundClockProps = {
    /** The round's three clock fields, or `null` when there is no round */
    clock: RoundClock | null;
    /** How far this device's clock is ahead of the server's, in milliseconds */
    skewMs: number;
    /** Whether the viewer may work the clock */
    canControl: boolean;
    /** How the clock is drawn */
    size?: RoundClockSize;
    /** Starts the clock from its full length */
    onStart?: () => void | Promise<void>;
    /** Stops it where it stands */
    onPause?: () => void | Promise<void>;
    /** Lets it run again */
    onResume?: () => void | Promise<void>;
    /** Adds to or takes from the time left */
    onAdjust?: (seconds: number) => void | Promise<void>;
};

/**
 * The round clock: the face starts, pauses and resumes it, with a minute off or on either side
 *
 * The digits' colour carries time pressure and the ring whether the clock is paused. At zero the
 * face calls time instead of counting into overtime.
 *
 * @returns the clock
 */
export function TournamentRoundClock({
    clock,
    skewMs,
    canControl,
    size = "inline",
    onStart,
    onPause,
    onResume,
    onAdjust,
}: TournamentRoundClockProps) {
    const [t] = useTranslation("tournament");
    const reading = useRoundClock(clock, skewMs);

    if (clock === null) return null;

    const running = reading.started && !reading.paused;
    const urgency =
        reading.over || reading.seconds <= URGENT_SECONDS
            ? "text-red-600 dark:text-red-400"
            : reading.seconds <= WARN_SECONDS
              ? "text-amber-600 dark:text-amber-400"
              : "text-zinc-950 dark:text-white";

    const digits = (
        <span
            aria-hidden={true}
            className={clsx(
                "font-mono leading-none font-semibold tabular-nums",
                urgency,
                size === "display" ? "text-[clamp(4rem,18vmin,12rem)]" : "text-[clamp(1.75rem,4vw,2.5rem)]",
            )}
        >
            {reading.over ? t("label.time-called") : formatDuration(reading.seconds)}
        </span>
    );

    // Not a live region: a clock read aloud every second drowns out the page.
    const announced = !reading.started
        ? t("label.clock-not-started")
        : reading.over
          ? t("label.time-over")
          : t("accessibility.round-clock", { time: formatDuration(reading.seconds) });
    const reader = (
        <span role={"timer"} aria-live={"off"} className={"sr-only"}>
            {announced}
        </span>
    );

    if (size === "display" || !canControl) {
        return (
            <div className={clsx("flex items-center", size === "display" ? "gap-6" : "gap-3")}>
                {digits}
                {reader}
                {reading.paused && <Badge color={"amber"}>{t("label.paused")}</Badge>}
            </div>
        );
    }

    const toggle = !reading.started ? onStart : reading.paused ? onResume : onPause;
    const toggleLabel = !reading.started
        ? t("button.start-clock")
        : reading.paused
          ? t("button.resume-clock")
          : t("button.pause-clock");

    const segment =
        "flex items-center justify-center transition-colors hover:bg-zinc-950/5 focus-visible:outline-2 " +
        "focus-visible:-outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40 " +
        "disabled:hover:bg-transparent dark:hover:bg-white/10";

    return (
        <div className={"flex items-center gap-3"}>
            <div
                className={clsx(
                    "inline-flex items-stretch divide-x divide-zinc-950/10 overflow-hidden rounded-lg dark:divide-white/15",
                    reading.paused
                        ? "ring-2 ring-amber-500/70 dark:ring-amber-400/70"
                        : "ring-1 ring-zinc-950/10 dark:ring-white/15",
                )}
            >
                {/* Not `CounterButton`: repeat-on-hold would silently add minutes. */}
                <button
                    type={"button"}
                    disabled={!reading.started}
                    onClick={() => void onAdjust?.(-NUDGE_SECONDS)}
                    aria-label={t("button.subtract-minute")}
                    className={clsx(segment, "px-3")}
                >
                    <MinusIcon className={"size-4 text-zinc-500 dark:text-zinc-400"} />
                </button>

                <button
                    type={"button"}
                    onClick={() => void toggle?.()}
                    aria-label={toggleLabel}
                    className={clsx(segment, "gap-2 px-4 py-2")}
                >
                    {running ? (
                        <PauseIcon className={"size-4 text-zinc-500 dark:text-zinc-400"} />
                    ) : (
                        <PlayIcon className={"size-4 text-zinc-500 dark:text-zinc-400"} />
                    )}
                    {digits}
                </button>

                <button
                    type={"button"}
                    disabled={!reading.started}
                    onClick={() => void onAdjust?.(NUDGE_SECONDS)}
                    aria-label={t("button.add-minute")}
                    className={clsx(segment, "px-3")}
                >
                    <PlusIcon className={"size-4 text-zinc-500 dark:text-zinc-400"} />
                </button>
            </div>
            {reader}
        </div>
    );
}
