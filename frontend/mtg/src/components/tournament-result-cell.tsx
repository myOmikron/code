import { ArrowUturnLeftIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { Badge, Listbox, ListboxLabel, ListboxOption, notify } from "components";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MatchTableResponse } from "src/api/generated";
import { isFormError } from "src/utils/error";

/**
 * One outcome a preset books in a single click
 */
type Preset = {
    /** What the button says */
    label: string;
    /** Who won, `null` for a draw */
    winner: string | null;
    /** Games the winner took */
    winnerGames: number;
    /** Games the loser took */
    loserGames: number;
    /** Games inside the match that were themselves drawn */
    gamesDrawn: number;
};

/**
 * The properties for {@link TournamentResultCell}
 */
export type TournamentResultCellProps = {
    /** The tournament the table belongs to */
    tournamentUuid: string;
    /** The table */
    table: MatchTableResponse;
    /** Best of how many games a duel at this event is */
    gamesPerMatch: number;
    /** Whether the viewer may write results here */
    canEdit: boolean;
    /** Called after the table changed */
    onChanged: () => void | Promise<void>;
};

/**
 * What happened at one table, and — for the desk — the one click that books it.
 *
 * **Presets, not two number inputs.** A best-of-three has five legal outcomes and a best-of-one
 * has three, so an empty cell is a row of buttons and entering a result is a single click. The
 * unusual things — a double loss, a game draw inside a decided match — are not here; those are
 * what the row's own menu is for, and they are rare enough that hiding them costs nothing and
 * showing them would cost every organizer a wider cell on every row.
 *
 * A pod gets a picker of the seated names instead: five buttons of scores mean nothing when four
 * people are sitting down and exactly one of them wins.
 *
 * @returns the cell
 */
export function TournamentResultCell({
    tournamentUuid,
    table,
    gamesPerMatch,
    canEdit,
    onChanged,
}: TournamentResultCellProps) {
    const [t] = useTranslation("tournament");

    const duel = table.seats.length === 2;
    const bestOfThree = duel && gamesPerMatch >= 3;

    /**
     * Books an outcome from the desk
     *
     * @param preset the outcome to write
     */
    async function book(preset: Preset) {
        const response = await Api.tournaments.matches.setResult(tournamentUuid, table.uuid, {
            winner: preset.winner ?? undefined,
            draw: preset.winner === null,
            winner_games: preset.winnerGames,
            loser_games: preset.loserGames,
            games_drawn: preset.gamesDrawn,
        });
        if (isFormError(response)) {
            notify.error(response.error.not_editable ? t("error.result-not-editable") : t("error.invalid-outcome"));
            return;
        }
        await onChanged();
    }

    /**
     * Takes the desk's result back off the table
     */
    async function clear() {
        const response = await Api.tournaments.matches.clearResult(tournamentUuid, table.uuid);
        if (isFormError(response)) {
            notify.error(t("error.result-not-editable"));
            return;
        }
        await onChanged();
    }

    if (table.is_bye) return <Badge color={"emerald"}>{t("label.bye")}</Badge>;

    const winner = table.seats.find((seat) => seat.participant === table.winner);
    const settled = table.status === "Confirmed";

    // A settled table says what happened; the desk gets the undo beside it rather than a second
    // row of presets, because changing a result is rarer than entering one and wants a moment of
    // friction more than it wants a shortcut.
    if (settled) {
        return (
            <span className={"flex flex-wrap items-center gap-2"}>
                <CheckCircleIcon className={"size-4 text-emerald-600 dark:text-emerald-400"} aria-hidden={true} />
                <span className={"text-zinc-950 dark:text-white"}>
                    {table.is_draw ? t("label.draw") : (winner?.display_name ?? "—")}
                </span>
                {canEdit && (
                    <button
                        type={"button"}
                        onClick={() => void clear()}
                        aria-label={t("button.clear-result")}
                        className={
                            "rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                        }
                    >
                        <ArrowUturnLeftIcon className={"size-4"} />
                    </button>
                )}
            </span>
        );
    }

    if (!canEdit) {
        return table.status === "Disputed" ? (
            <Badge color={"red"}>{t("label.disputed")}</Badge>
        ) : table.status === "Pending" ? (
            <Badge color={"amber"}>{t("label.pending")}</Badge>
        ) : (
            <span className={"text-zinc-500 dark:text-zinc-400"}>{t("label.table-open")}</span>
        );
    }

    const presets: Array<Preset> = duel
        ? bestOfThree
            ? [
                  { label: "2–0", winner: table.seats[0].participant, winnerGames: 2, loserGames: 0, gamesDrawn: 0 },
                  { label: "2–1", winner: table.seats[0].participant, winnerGames: 2, loserGames: 1, gamesDrawn: 0 },
                  { label: t("label.draw-short"), winner: null, winnerGames: 1, loserGames: 1, gamesDrawn: 1 },
                  { label: "1–2", winner: table.seats[1].participant, winnerGames: 2, loserGames: 1, gamesDrawn: 0 },
                  { label: "0–2", winner: table.seats[1].participant, winnerGames: 2, loserGames: 0, gamesDrawn: 0 },
              ]
            : [
                  { label: "◀", winner: table.seats[0].participant, winnerGames: 1, loserGames: 0, gamesDrawn: 0 },
                  { label: t("label.draw-short"), winner: null, winnerGames: 0, loserGames: 0, gamesDrawn: 1 },
                  { label: "▶", winner: table.seats[1].participant, winnerGames: 1, loserGames: 0, gamesDrawn: 0 },
              ]
        : [];

    return (
        <span className={"flex flex-wrap items-center gap-2"}>
            {table.status === "Disputed" && <Badge color={"red"}>{t("label.disputed")}</Badge>}
            {table.status === "Pending" && <Badge color={"amber"}>{t("label.pending")}</Badge>}

            {duel ? (
                <span
                    className={
                        "inline-flex items-stretch divide-x divide-zinc-950/10 overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:divide-white/15 dark:ring-white/15"
                    }
                >
                    {presets.map((preset) => (
                        <button
                            key={preset.label}
                            type={"button"}
                            onClick={() => void book(preset)}
                            aria-label={
                                preset.winner === null
                                    ? t("label.draw")
                                    : t("accessibility.wins", {
                                          name: table.seats.find((seat) => seat.participant === preset.winner)
                                              ?.display_name,
                                          score: preset.label,
                                      })
                            }
                            className={clsx(
                                "px-2.5 py-1 font-mono text-xs tabular-nums transition-colors",
                                "hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:-outline-offset-2",
                                "focus-visible:outline-blue-500 dark:hover:bg-white/10",
                            )}
                        >
                            {preset.label}
                        </button>
                    ))}
                </span>
            ) : (
                // A pod: one of these four won, and a row of scores would say nothing.
                <Listbox
                    value={""}
                    onChange={(value: string) => {
                        if (value === "") return;
                        void book({
                            label: value,
                            winner: value === "draw" ? null : value,
                            winnerGames: value === "draw" ? 0 : 1,
                            loserGames: 0,
                            gamesDrawn: value === "draw" ? 1 : 0,
                        });
                    }}
                    placeholder={t("label.who-won")}
                    className={"min-w-40"}
                >
                    {table.seats.map((seat) => (
                        <ListboxOption key={seat.participant} value={seat.participant}>
                            <ListboxLabel>{seat.display_name}</ListboxLabel>
                        </ListboxOption>
                    ))}
                    <ListboxOption value={"draw"}>
                        <ListboxLabel>{t("label.draw")}</ListboxLabel>
                    </ListboxOption>
                </Listbox>
            )}
        </span>
    );
}
