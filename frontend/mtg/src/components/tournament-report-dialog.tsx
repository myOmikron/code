import { Button, Dialog, DialogActions, DialogBody, DialogTitle, PrimaryButton, notify } from "components";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MatchReportResponse, MatchTableResponse } from "src/api/generated";
import { GameCounter } from "src/components/tournament-result-dialog";
import { isFormError } from "src/utils/error";

/** A draw rather than somebody's win */
const DRAW = "draw";

/** The properties for {@link TournamentReportDialog} */
export type TournamentReportDialogProps = {
    /** The tournament the table belongs to */
    tournamentUuid: string;
    /** The table being reported, or `null` while closed */
    table: MatchTableResponse | null;
    /** Which seat the viewer is */
    me: string;
    /** Best of how many games a duel at this event is */
    gamesPerMatch: number;
    /** What the viewer reported before, to start from */
    previous?: MatchReportResponse;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the report went in */
    onSaved: () => void | Promise<void>;
};

/**
 * A player reporting their own table: who won, and in a duel the game score
 *
 * @returns the dialog
 */
export function TournamentReportDialog({
    tournamentUuid,
    table,
    me,
    gamesPerMatch,
    previous,
    onClose,
    onSaved,
}: TournamentReportDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [pick, setPick] = useState<string | null>(null);
    const [winnerGames, setWinnerGames] = useState(1);
    const [loserGames, setLoserGames] = useState(0);
    const [saving, setSaving] = useState(false);

    const need = Math.ceil(Math.max(gamesPerMatch, 1) / 2);

    useEffect(() => {
        if (table === null) return;
        setPick(previous === undefined ? null : previous.draw ? DRAW : (previous.winner ?? null));
        setWinnerGames(previous?.winner_games ?? need);
        setLoserGames(previous?.loser_games ?? 0);
    }, [table, previous, need]);

    if (table === null) return null;

    const duel = table.seats.length === 2;
    const scored = duel && need > 1 && pick !== null;
    const nameOf = (participant: string) =>
        table.seats.find((seat) => seat.participant === participant)?.display_name ?? "";

    /**
     * Picks who won, and resets the score to the most common one for it
     *
     * @param next a participant, or {@link DRAW}
     */
    function choose(next: string) {
        setPick(next);
        if (next === DRAW) {
            setWinnerGames(need > 1 ? 1 : 0);
            setLoserGames(need > 1 ? 1 : 0);
        } else {
            setWinnerGames(need);
            setLoserGames(0);
        }
    }

    /**
     * Sends the report
     */
    async function send() {
        if (table === null || pick === null) return;
        setSaving(true);
        try {
            const draw = pick === DRAW;
            const response = await Api.tournaments.matches.report(tournamentUuid, table.uuid, {
                winner: draw ? undefined : pick,
                draw,
                winner_games: duel ? winnerGames : draw ? 0 : 1,
                loser_games: duel ? (draw ? winnerGames : loserGames) : 0,
                games_drawn: 0,
                client_key: crypto.randomUUID(),
            });
            if (isFormError(response)) {
                const refusal = response.error;
                notify.error(
                    refusal.round_closed
                        ? t("error.result-not-editable")
                        : refusal.not_seated
                          ? t("error.not-seated")
                          : t("error.invalid-outcome"),
                );
                return;
            }
            onClose();
            await onSaved();
        } finally {
            setSaving(false);
        }
    }

    const options = [
        ...table.seats.map((seat) => ({
            value: seat.participant,
            label: seat.participant === me ? t("label.i-won") : t("label.player-won", { name: seat.display_name }),
        })),
        { value: DRAW, label: t("label.draw") },
    ];
    const winner = pick !== null && pick !== DRAW ? pick : null;
    const loser =
        winner === null ? null : (table.seats.find((seat) => seat.participant !== winner)?.participant ?? null);
    // A win asks for the loser's games; a draw for how many games each side won.
    const score =
        loser !== null
            ? {
                  label: nameOf(loser),
                  value: loserGames,
                  optionLabel: (count: number) => t("accessibility.games-won", { name: nameOf(loser), count }),
                  onChange: setLoserGames,
              }
            : {
                  label: t("label.games-won"),
                  value: winnerGames,
                  optionLabel: (count: number) => t("accessibility.games-drawn", { count }),
                  onChange: setWinnerGames,
              };

    return (
        <Dialog open={true} onClose={onClose} size={"sm"}>
            <DialogTitle>{t("heading.report-result")}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-6"}>
                    <div className={"flex flex-col gap-2"} role={"group"} aria-label={t("heading.report-result")}>
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type={"button"}
                                aria-pressed={pick === option.value}
                                onClick={() => choose(option.value)}
                                className={clsx(
                                    "rounded-lg px-3.5 py-2.5 text-left text-base/6 font-medium text-zinc-950 ring-1 transition-colors sm:text-sm/6 dark:text-white",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
                                    pick === option.value
                                        ? "bg-blue-500/10 ring-2 ring-blue-500"
                                        : "ring-zinc-950/10 hover:bg-zinc-950/5 dark:ring-white/15 dark:hover:bg-white/5",
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {scored && (
                        <div className={"flex flex-wrap items-center justify-between gap-3"}>
                            <span className={"text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white"}>
                                {score.label}
                            </span>
                            <GameCounter
                                value={score.value}
                                options={Array.from({ length: need }, (_, index) => index)}
                                label={score.optionLabel}
                                onChange={score.onChange}
                            />
                        </div>
                    )}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton disabled={saving || pick === null} onClick={() => void send()}>
                    {t("button.send-report")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}
