import { MinusIcon, PauseIcon, PlayIcon, PlusIcon } from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
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

/**
 * How the clock is drawn
 *
 * `inline` sits in a toolbar beside other controls. `display` is the projector: no controls at
 * all, and as large as the room needs.
 */
export type RoundClockSize = "inline" | "display";

/**
 * The properties for {@link TournamentRoundClock}
 */
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
 * The round clock, and — for the desk — the four controls that work it.
 *
 * Colour lives on the digits and never on a background: a clock that flashes a filled colour for
 * the last five minutes of every round is unbearable in a room somebody has to sit in all evening.
 * Overtime keeps counting rather than stopping at zero, because "four minutes over" is the number
 * a judge actually needs.
 *
 * The face itself is hidden from assistive technology and a sibling `role="timer"` carries the
 * reading instead, updated only as the round crosses its thresholds — a live region that announces
 * every second is unusable.
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

    const urgency = reading.over
        ? "text-red-600 dark:text-red-400"
        : reading.paused
          ? "text-amber-600 dark:text-amber-400"
          : reading.seconds <= URGENT_SECONDS
            ? "text-red-600 dark:text-red-400"
            : reading.seconds <= WARN_SECONDS
              ? "text-amber-600 dark:text-amber-400"
              : "text-zinc-950 dark:text-white";

    // Announced at the thresholds only: a screen reader reading a ticking clock aloud every second
    // makes the rest of the page unusable.
    const announced = !reading.started
        ? t("label.clock-not-started")
        : reading.over
          ? t("label.time-over")
          : t("accessibility.round-clock", { time: formatDuration(reading.seconds) });

    return (
        <div className={clsx("flex items-center", size === "display" ? "gap-6" : "gap-3")}>
            <span
                aria-hidden={true}
                className={clsx(
                    "font-mono font-semibold tabular-nums",
                    urgency,
                    size === "display"
                        ? "text-[clamp(4rem,18vmin,12rem)] leading-none"
                        : "text-[clamp(1.75rem,4vw,2.5rem)] leading-none",
                )}
            >
                {formatDuration(reading.seconds)}
            </span>
            <span role={"timer"} aria-live={"off"} className={"sr-only"}>
                {announced}
            </span>

            {reading.paused && <Badge color={"amber"}>{t("label.paused")}</Badge>}

            {size === "inline" && canControl && (
                <div className={"flex flex-wrap items-center gap-2"}>
                    {!reading.started && (
                        <Button outline={true} onClick={() => void onStart?.()}>
                            <PlayIcon />
                            {t("button.start-clock")}
                        </Button>
                    )}
                    {reading.started && !reading.paused && (
                        <Button plain={true} onClick={() => void onPause?.()}>
                            <PauseIcon />
                            {t("button.pause-clock")}
                        </Button>
                    )}
                    {reading.paused && (
                        <Button outline={true} onClick={() => void onResume?.()}>
                            <PlayIcon />
                            {t("button.resume-clock")}
                        </Button>
                    )}
                    {reading.started && (
                        <>
                            {/* Plain buttons, deliberately not the press-and-hold `CounterButton`:
                                a repeat on hold is a way to silently add ten minutes to a round. */}
                            <Button
                                plain={true}
                                onClick={() => void onAdjust?.(-NUDGE_SECONDS)}
                                aria-label={t("button.subtract-minute")}
                            >
                                <MinusIcon />
                            </Button>
                            <Button
                                plain={true}
                                onClick={() => void onAdjust?.(NUDGE_SECONDS)}
                                aria-label={t("button.add-minute")}
                            >
                                <PlusIcon />
                            </Button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
