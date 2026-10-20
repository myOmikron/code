import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { StandingResponse, TiebreakerResponse } from "src/api/generated";
import { TournamentTiebreakerHelp } from "src/components/tournament-tiebreaker-help";
import { formatAveragePoints, formatPercent, formatRecord } from "src/utils/standings";

/** A tiebreaker's column: its heading and how a row reads in it */
type Column = { label: string; read: (row: StandingResponse) => string };

/** The properties for {@link TournamentStandingsTable} */
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
 * Where everybody stands, with a column for each tiebreaker the event applies
 *
 * A shared place is printed on every row that holds it, muted after the first.
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

    // Match points already have a column of their own.
    const byTiebreaker: Partial<Record<TiebreakerResponse, Column>> = {
        MatchWinPercent: { label: t("label.tiebreak-mw"), read: (row) => formatPercent(row.match_win) },
        OpponentMatchWinPercent: {
            label: t("label.tiebreak-omw"),
            read: (row) => formatPercent(row.opponent_match_win),
        },
        GameWinPercent: { label: t("label.tiebreak-gw"), read: (row) => formatPercent(row.game_win) },
        OpponentGameWinPercent: {
            label: t("label.tiebreak-ogw"),
            read: (row) => formatPercent(row.opponent_game_win),
        },
        OpponentsAveragePoints: {
            label: t("label.tiebreak-opp-points"),
            read: (row) => formatAveragePoints(row.opponents_average_points),
        },
    };
    const columns = tiebreakers.flatMap((tiebreaker) => {
        const column = byTiebreaker[tiebreaker];
        return column === undefined ? [] : [{ key: tiebreaker, ...column }];
    });

    /**
     * Whether this row repeats the place above it
     *
     * @param index the row
     *
     * @returns whether the place is shared
     */
    const shares = (index: number) => index > 0 && standings[index - 1].place === standings[index].place;

    /**
     * The player's name, struck through once dropped
     *
     * @param row the row
     *
     * @returns the name
     */
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

            {/* Capped so the numbers stay close to the names. */}
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
