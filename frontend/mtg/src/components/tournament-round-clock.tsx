import { ClockIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Badge, Text } from "components";
import { useTranslation } from "react-i18next";
import { Ruleset } from "src/api/generated";
import type { RoundTimerResponse } from "src/api/generated";
import { formatClock } from "src/utils/round-clock";
import { useRoundClock } from "src/utils/use-round-clock";

/** Below this many seconds the digits turn amber */
const WARN_SECONDS = 5 * 60;

/** Below this many seconds they turn red */
const URGENT_SECONDS = 60;

/**
 * The properties for {@link TournamentRoundClock}
 */
export type TournamentRoundClockProps = {
    /** The running Round's timer */
    timer: RoundTimerResponse;
    /** The Ruleset the Tournament follows, which sets what happens at time up */
    ruleset: Ruleset;
    /** How far this device's clock is ahead of the server's, in milliseconds */
    skewMs: number;
};

/**
 * The round timer counting down, and at time up the Ruleset's extra turns as information.
 * A paused timer holds its digits.
 *
 * @returns the timer
 */
export function TournamentRoundClock({ timer, ruleset, skewMs }: TournamentRoundClockProps) {
    const [t] = useTranslation("tournament");
    const reading = useRoundClock(timer, skewMs);

    const colour = timer.paused
        ? "text-zinc-500 dark:text-zinc-400"
        : reading.timeUp || reading.seconds <= URGENT_SECONDS
          ? "text-red-600 dark:text-red-400"
          : reading.seconds <= WARN_SECONDS
            ? "text-amber-600 dark:text-amber-400"
            : "text-zinc-950 dark:text-white";
    const milestone = timer.paused
        ? t("label.timer-paused")
        : reading.timeUp
          ? t("label.time-up")
          : reading.seconds <= URGENT_SECONDS
            ? t("accessibility.timer-one-minute")
            : reading.seconds <= WARN_SECONDS
              ? t("accessibility.timer-five-minutes")
              : "";

    const hint =
        ruleset === Ruleset.Mtr
            ? t("description.time-up-mtr", { count: timer.extra_turns })
            : ruleset === Ruleset.TopDeck
              ? t("description.time-up-top-deck")
              : t("description.time-up-multiplayer-addendum");

    return (
        <div className={"flex flex-col gap-1"}>
            <div className={"flex items-center gap-2"}>
                <ClockIcon className={"size-5 text-zinc-500 dark:text-zinc-400"} aria-hidden={true} />
                <span
                    role={"timer"}
                    aria-label={
                        reading.timeUp
                            ? t("label.time-up")
                            : t("accessibility.timer", { time: formatClock(reading.seconds) })
                    }
                    className={clsx("font-mono text-3xl/none font-semibold tabular-nums", colour)}
                >
                    {reading.timeUp ? t("label.time-up") : formatClock(reading.seconds)}
                </span>
                {timer.paused && <Badge color={"zinc"}>{t("label.timer-paused")}</Badge>}
                <span aria-live={"polite"} className={"sr-only"}>
                    {milestone}
                </span>
            </div>
            {reading.timeUp && <Text>{hint}</Text>}
        </div>
    );
}
