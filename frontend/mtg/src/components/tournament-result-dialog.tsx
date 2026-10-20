import {
    Button,
    Checkbox,
    CheckboxField,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Label,
    PrimaryButton,
    Text,
    notify,
} from "components";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MatchTableResponse } from "src/api/generated";
import { isFormError } from "src/utils/error";

/** The label in front of a row of counts */
const ROW_LABEL = "w-32 shrink-0 text-base/6 text-zinc-950 select-none sm:text-sm/6 dark:text-white";

/** The properties for {@link TournamentResultDialog} */
export type TournamentResultDialogProps = {
    /** The tournament the table belongs to */
    tournamentUuid: string;
    /** The table being reported, or `null` while the dialog is closed */
    table: MatchTableResponse | null;
    /** Best of how many games a match at this event is */
    gamesPerMatch: number;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the table changed */
    onSaved: () => void | Promise<void>;
};

/**
 * The desk entering one table's result as games won per seat, with an optional drop per player
 *
 * Most games wins and everybody level draws, so an intentional draw is every seat on zero.
 *
 * @returns the dialog
 */
export function TournamentResultDialog({
    tournamentUuid,
    table,
    gamesPerMatch,
    onClose,
    onSaved,
}: TournamentResultDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const [wins, setWins] = useState<Record<string, number>>({});
    const [draws, setDraws] = useState(0);
    const [dropping, setDropping] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (table === null) return;
        setWins(Object.fromEntries(table.seats.map((seat) => [seat.participant, seat.games_won])));
        setDraws(table.games_drawn);
        setDropping({});
    }, [table]);

    if (table === null) return null;

    // A best of three is decided at two wins; draws can fill the whole match.
    const bestOf = Math.max(gamesPerMatch, 1);
    const winCounts = Array.from({ length: Math.ceil(bestOf / 2) + 1 }, (_, index) => index);
    const drawCounts = Array.from({ length: bestOf + 1 }, (_, index) => index);

    /**
     * Takes the desk's result back off the table
     */
    async function clear() {
        if (table === null) return;
        setSaving(true);
        try {
            const response = await Api.tournaments.matches.clearResult(tournamentUuid, table.uuid);
            if (isFormError(response)) {
                notify.error(t("error.result-not-editable"));
                return;
            }
            onClose();
            await onSaved();
        } finally {
            setSaving(false);
        }
    }

    /**
     * Books the result, and drops whoever was ticked
     */
    async function save() {
        if (table === null) return;
        setSaving(true);
        try {
            const scores = table.seats.map((seat) => ({
                participant: seat.participant,
                won: wins[seat.participant] ?? 0,
            }));
            const best = Math.max(...scores.map((score) => score.won));
            const leaders = scores.filter((score) => score.won === best);
            const drawn = leaders.length !== 1;
            const winner = drawn ? undefined : leaders[0].participant;
            const loserGames = drawn
                ? best
                : Math.max(0, ...scores.filter((score) => score.participant !== winner).map((score) => score.won));

            const response = await Api.tournaments.matches.setResult(tournamentUuid, table.uuid, {
                winner,
                draw: drawn,
                winner_games: best,
                loser_games: loserGames,
                games_drawn: draws,
            });
            if (isFormError(response)) {
                notify.error(response.error.not_editable ? t("error.result-not-editable") : t("error.invalid-outcome"));
                return;
            }

            // After the result, so a failed drop cannot leave the table unreported too.
            for (const seat of table.seats) {
                if (!dropping[seat.participant] || seat.dropped) continue;
                try {
                    await Api.tournaments.participants.drop(tournamentUuid, seat.participant);
                } catch (error) {
                    console.error(error);
                    notify.error(t("error.drop-failed", { name: seat.display_name }));
                }
            }

            onClose();
            await onSaved();
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={true} onClose={onClose}>
            <DialogTitle>{t("heading.report-result")}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-6"}>
                    {table.seats.map((seat) => (
                        <div key={seat.participant} className={"flex flex-col gap-3"}>
                            <span className={"text-base font-semibold text-zinc-950 dark:text-white"}>
                                {seat.display_name}
                            </span>

                            <div className={"flex flex-wrap items-center gap-3"}>
                                <span className={ROW_LABEL}>{t("label.games-won")}</span>
                                <GameCounter
                                    value={wins[seat.participant] ?? 0}
                                    options={winCounts}
                                    label={(count) => t("accessibility.games-won", { name: seat.display_name, count })}
                                    onChange={(value) =>
                                        setWins((current) => ({ ...current, [seat.participant]: value }))
                                    }
                                />
                            </div>

                            {seat.dropped ? (
                                <Text className={"text-sm"}>{t("label.already-dropped")}</Text>
                            ) : (
                                <CheckboxField>
                                    <Checkbox
                                        checked={dropping[seat.participant] ?? false}
                                        onChange={(checked) =>
                                            setDropping((current) => ({ ...current, [seat.participant]: checked }))
                                        }
                                    />
                                    <Label>{t("label.drop-player")}</Label>
                                </CheckboxField>
                            )}
                        </div>
                    ))}

                    <div className={"flex flex-wrap items-center gap-3"}>
                        <span className={ROW_LABEL}>{t("label.draws")}</span>
                        <GameCounter
                            value={draws}
                            options={drawCounts}
                            label={(count) => t("accessibility.games-drawn", { count })}
                            onChange={setDraws}
                        />
                    </div>
                </div>
            </DialogBody>
            <DialogActions>
                {/* Falls back to what the players reported, not to zero. */}
                {table.status === "Confirmed" && (
                    <Button plain={true} disabled={saving} onClick={() => void clear()}>
                        {t("button.clear-result")}
                    </Button>
                )}
                <Button plain={true} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <PrimaryButton disabled={saving} onClick={() => void save()}>
                    {t("button.save-result")}
                </PrimaryButton>
            </DialogActions>
        </Dialog>
    );
}

/** The properties for {@link GameCounter} */
export type GameCounterProps = {
    /** The chosen count */
    value: number;
    /** Every count that can be chosen */
    options: Array<number>;
    /** The accessible name of one option */
    label: (count: number) => string;
    /** Called when a count is chosen */
    onChange: (value: number) => void;
};

/**
 * A segmented row of small counts, one of them pressed
 *
 * @returns the row
 */
export function GameCounter({ value, options, label, onChange }: GameCounterProps) {
    return (
        <span
            className={
                "inline-flex items-stretch divide-x divide-zinc-950/10 overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:divide-white/15 dark:ring-white/15"
            }
        >
            {options.map((count) => (
                <button
                    key={count}
                    type={"button"}
                    aria-pressed={count === value}
                    aria-label={label(count)}
                    onClick={() => onChange(count)}
                    className={clsx(
                        "px-3.5 py-1.5 font-mono text-sm tabular-nums transition-colors",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500",
                        count === value
                            ? "bg-zinc-950 font-semibold text-white dark:bg-white dark:text-zinc-950"
                            : "hover:bg-zinc-950/5 dark:hover:bg-white/10",
                    )}
                >
                    {count}
                </button>
            ))}
        </span>
    );
}
