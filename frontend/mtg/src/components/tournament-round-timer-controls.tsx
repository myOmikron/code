import { ArrowPathIcon, PauseIcon, PlayIcon } from "@heroicons/react/20/solid";
import { Button, ConfirmDialog, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { RoundErrors, RoundTimerResponse, SetRoundTimerRequest } from "src/api/generated";
import { isFormError } from "src/utils/error";
import { formatClock } from "src/utils/round-clock";

/**
 * The properties for {@link TournamentRoundTimerControls}
 */
export type TournamentRoundTimerControlsProps = {
    /** The Tournament's uuid */
    tournamentUuid: string;
    /** The running Round's number */
    round: number;
    /** Its round timer */
    timer: RoundTimerResponse;
    /** Called after the timer changed */
    onChanged: () => Promise<void>;
};

/**
 * An Organizer's controls for the round timer of the running Round: pause or resume,
 * take away or add minutes, and reset it to its full length.
 *
 * @returns the controls
 */
export function TournamentRoundTimerControls({
    tournamentUuid,
    round,
    timer,
    onChanged,
}: TournamentRoundTimerControlsProps) {
    const [t] = useTranslation("tournament");
    const [busy, setBusy] = useState(false);
    const [resetting, setResetting] = useState(false);

    /**
     * Sends `request` to the round timer, then reads the Round again
     *
     * @param request what to do to the timer
     */
    async function send(request: SetRoundTimerRequest) {
        setBusy(true);
        try {
            const result = await Api.tournaments.rounds.setTimer(tournamentUuid, round, request);
            if (isFormError<unknown, { result: "Err"; error: RoundErrors }>(result)) {
                notify.error(
                    result.error.not_running || result.error.tournament_over
                        ? t("error.round-not-running")
                        : t("error.round-changed"),
                );
            }
            await onChanged();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Adds `minutes` to the timer, or takes them away if negative
     *
     * @param minutes how many minutes
     */
    function adjust(minutes: number) {
        void send({ action: "Adjust", delta_seconds: minutes * 60 });
    }

    return (
        <div className={"flex flex-wrap items-center gap-2"}>
            {timer.paused ? (
                <Button outline disabled={busy} onClick={() => void send({ action: "Resume" })}>
                    <PlayIcon />
                    {t("button.resume-timer")}
                </Button>
            ) : (
                <Button outline disabled={busy} onClick={() => void send({ action: "Pause" })}>
                    <PauseIcon />
                    {t("button.pause-timer")}
                </Button>
            )}
            <Button outline disabled={busy} onClick={() => adjust(-1)}>
                {t("button.take-minutes", { minutes: 1 })}
            </Button>
            <Button outline disabled={busy} onClick={() => adjust(1)}>
                {t("button.add-minutes", { minutes: 1 })}
            </Button>
            <Button outline disabled={busy} onClick={() => adjust(5)}>
                {t("button.add-minutes", { minutes: 5 })}
            </Button>
            <Button plain disabled={busy} onClick={() => setResetting(true)}>
                <ArrowPathIcon />
                {t("button.reset-timer")}
            </Button>
            <ConfirmDialog
                open={resetting}
                onClose={() => setResetting(false)}
                onConfirm={async () => {
                    setResetting(false);
                    await send({ action: "Reset" });
                }}
                title={t("heading.reset-timer")}
                description={t("description.reset-timer", { time: formatClock(timer.length_seconds) })}
                confirmLabel={t("button.reset-timer")}
            />
        </div>
    );
}
