import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { StandingResponse, TiebreakerResponse } from "src/api/generated";
import { TournamentTiebreakerHelp } from "src/components/tournament-tiebreaker-help";
import { formatAveragePoints, formatPercent, formatRecord } from "src/utils/standings";

/**
 * The properties for {@link TournamentStandingsTable}
 */
export type TournamentStandingsTableProps = {
    /** The rows, best first */
    standings: Array<StandingResponse>;
    /** Which tiebreakers this event applies, most significant first */
    tiebreakers: Array<TiebreakerResponse>;
    /** How many tables of the current round have no settled result */
    outstandingTables: number;
    /** Which participant the viewer is, so their own row stands out */
    ownParticipant?: string | null;
};

/**
 * Where everybody stands.
 *
 * The columns follow whatever tiebreakers the event actually applies rather than a fixed set:
 * duels are scored on opponents' match wins and game wins, pods on the player's own rate and their
 * opponents' points, and showing a column that decides nothing here would invite an argument about
 * a number that was never used.
 *
 * A shared place is printed on every row that holds it, muted after the first. Blanking the
 * repeats would read as a rendering bug, and a player looking for their own line should not have to
 * count upwards to find out what place they are in.
 *
 * @returns the table
 */
export function TournamentStandingsTable({
    standings,
    tiebreakers,
    outstandingTables,
    ownParticipant,
}: TournamentStandingsTableProps) {
    const [t] = useTranslation("tournament");

    /** The column one tiebreaker earns, or nothing when another column already says it */
    const column = (tiebreaker: TiebreakerResponse) => {
        switch (tiebreaker) {
            // Match points already have a column of their own.
            case "MatchPoints":
                return null;
            case "MatchWinPercent":
                return {
                    key: tiebreaker,
                    label: t("label.tiebreak-mw"),
                    read: (row: StandingResponse) => formatPercent(row.match_win),
                };
            case "OpponentMatchWinPercent":
                return {
                    key: tiebreaker,
                    label: t("label.tiebreak-omw"),
                    read: (row: StandingResponse) => formatPercent(row.opponent_match_win),
                };
            case "GameWinPercent":
                return {
                    key: tiebreaker,
                    label: t("label.tiebreak-gw"),
                    read: (row: StandingResponse) => formatPercent(row.game_win),
                };
            case "OpponentGameWinPercent":
                return {
                    key: tiebreaker,
                    label: t("label.tiebreak-ogw"),
                    read: (row: StandingResponse) => formatPercent(row.opponent_game_win),
                };
            case "OpponentsAveragePoints":
                return {
                    key: tiebreaker,
                    label: t("label.tiebreak-opp-points"),
                    read: (row: StandingResponse) => formatAveragePoints(row.opponents_average_points),
                };
        }
    };

    const columns = tiebreakers.map(column).filter((entry) => entry !== null);

    /** Whether this row repeats the place above it */
    const shares = (index: number) => index > 0 && standings[index - 1].place === standings[index].place;

    /** The player's name, with whatever is worth saying beside it */
    const name = (row: StandingResponse) => (
        <span className={"flex flex-wrap items-center gap-2"}>
            <span className={clsx("text-zinc-950 dark:text-white", row.dropped && "line-through opacity-60")}>
                {row.display_name}
            </span>
            {row.dropped && <Badge color={"zinc"}>{t("label.dropped")}</Badge>}
        </span>
    );

    return (
        <div className={"flex flex-col gap-4"}>
            {/* Said before anybody wonders: ranks move while tables are still out, and a reader
                who does not know that thinks the table is unstable rather than incomplete. */}
            {outstandingTables > 0 && (
                <Text className={"text-sm"}>{t("description.outstanding-tables", { count: outstandingTables })}</Text>
            )}

            <ul className={"flex flex-col gap-2 sm:hidden"}>
                {standings.map((row, index) => (
                    <li
                        key={row.participant}
                        className={clsx(
                            "flex flex-col gap-1 rounded-(--radius-card) bg-(--surface-card) px-4 py-3 ring-1",
                            row.participant === ownParticipant
                                ? "ring-2 ring-blue-500/50"
                                : "ring-zinc-950/5 dark:ring-white/10",
                        )}
                    >
                        <div className={"flex items-center justify-between gap-3"}>
                            <span className={"flex items-center gap-2 text-sm font-semibold"}>
                                <span
                                    className={clsx(
                                        "font-mono tabular-nums",
                                        shares(index)
                                            ? "text-zinc-400 dark:text-zinc-500"
                                            : "text-zinc-950 dark:text-white",
                                    )}
                                >
                                    {row.place}
                                </span>
                                {name(row)}
                            </span>
                            <span className={"font-mono text-sm font-semibold tabular-nums"}>{row.match_points}</span>
                        </div>
                        <span className={"flex flex-wrap gap-x-3 text-xs text-zinc-500 dark:text-zinc-400"}>
                            <span className={"font-mono tabular-nums"}>
                                {formatRecord(row.wins, row.losses, row.draws)}
                            </span>
                            {columns.map((entry) => (
                                <span key={entry.key} className={"font-mono tabular-nums"}>
                                    {entry.label} {entry.read(row)}
                                </span>
                            ))}
                        </span>
                    </li>
                ))}
            </ul>

            {/* Capped rather than stretched: seven short columns across a wide screen leaves a
                hand's width of nothing between a name and its numbers, and the eye has to travel
                it on every row. */}
            <div className={"hidden max-w-4xl sm:block"}>
                <Table dense={true} striped={true} className={"[--gutter:--spacing(3)]"}>
                    <TableHead>
                        <TableRow>
                            <TableHeader className={"w-14"}>{t("heading.place")}</TableHeader>
                            <TableHeader>{t("heading.player")}</TableHeader>
                            <TableHeader className={"w-24"}>{t("heading.record")}</TableHeader>
                            <TableHeader className={"w-20"}>{t("heading.points")}</TableHeader>
                            {columns.map((entry) => (
                                <TableHeader key={entry.key} className={"w-24"}>
                                    {entry.label}
                                </TableHeader>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {standings.map((row, index) => (
                            <TableRow
                                key={row.participant}
                                className={clsx(
                                    row.participant === ownParticipant && "ring-2 ring-blue-500/40 ring-inset",
                                )}
                            >
                                <TableCell>
                                    <span
                                        className={clsx(
                                            "font-mono font-semibold tabular-nums",
                                            shares(index) && "text-zinc-400 dark:text-zinc-500",
                                        )}
                                    >
                                        {row.place}
                                    </span>
                                </TableCell>
                                <TableCell>{name(row)}</TableCell>
                                <TableCell>
                                    <span className={"font-mono tabular-nums"}>
                                        {formatRecord(row.wins, row.losses, row.draws)}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className={"font-mono font-semibold tabular-nums"}>{row.match_points}</span>
                                </TableCell>
                                {columns.map((entry) => (
                                    <TableCell key={entry.key}>
                                        <span className={"font-mono text-sm tabular-nums"}>{entry.read(row)}</span>
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <TournamentTiebreakerHelp tiebreakers={tiebreakers} />
        </div>
    );
}
