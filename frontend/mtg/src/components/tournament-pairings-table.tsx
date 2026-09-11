import { MapPinIcon } from "@heroicons/react/20/solid";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { MatchSeatResponse, MatchTableResponse } from "src/api/generated";

/**
 * The properties for {@link TournamentPairingsTable}
 */
export type TournamentPairingsTableProps = {
    /** The round's tables, byes last */
    tables: Array<MatchTableResponse>;
    /** Which participant the viewer is, so their own table stands out */
    ownParticipant?: string | null;
};

/**
 * Who is sitting where this round.
 *
 * Two shapes, chosen by what is actually on the tables rather than by a
 * setting: a field of duels gets a column per player, because "who plays whom"
 * is the question, and pods get one column listing the seats in turn order,
 * because four names do not fit across a page and turn order is what a pod
 * needs to know.
 *
 * **No pagination.** An organizer scanning for the table that has not reported
 * wants one scroll and a browser find, not twelve rows and a next button. Below
 * the small breakpoint it becomes a list of cards rather than a four-column
 * side-scroller.
 *
 * @returns the table
 */
export function TournamentPairingsTable({ tables, ownParticipant }: TournamentPairingsTableProps) {
    const [t] = useTranslation("tournament");

    // A bye seats one and a duel seats two; anything wider is a pod.
    const duels = tables.every((table) => table.is_bye || table.seats.length <= 2);

    /** Whether the viewer is sitting at this table */
    const own = (table: MatchTableResponse) =>
        ownParticipant != null && table.seats.some((seat) => seat.participant === ownParticipant);

    /** One player, with whatever is worth saying about them beside the name */
    const player = (seat: MatchSeatResponse | undefined, showSeat: boolean) => {
        if (seat === undefined) return <Text>—</Text>;
        return (
            <span className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                {showSeat && (
                    <span className={"font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>
                        {seat.seat}
                    </span>
                )}
                <span className={clsx("text-zinc-950 dark:text-white", seat.dropped && "line-through opacity-60")}>
                    {seat.display_name}
                </span>
                {seat.fixed_table != null && (
                    <MapPinIcon
                        className={"size-4 text-zinc-400 dark:text-zinc-500"}
                        aria-label={t("label.pinned-table", { number: seat.fixed_table })}
                    />
                )}
                {seat.dropped && <Badge color={"zinc"}>{t("label.dropped")}</Badge>}
            </span>
        );
    };

    /** What the result column says before anybody has reported anything */
    const result = (table: MatchTableResponse) => {
        if (table.is_bye) return <Badge color={"emerald"}>{t("label.bye")}</Badge>;
        if (table.status === "Confirmed") {
            const winner = table.seats.find((seat) => seat.participant === table.winner);
            return <Text>{table.is_draw ? t("label.draw") : (winner?.display_name ?? "—")}</Text>;
        }
        return <Text>{t("label.table-open")}</Text>;
    };

    /** The number on the table, or that a bye is not one */
    const number = (table: MatchTableResponse) =>
        table.is_bye ? (
            <span className={"text-zinc-500 dark:text-zinc-400"}>—</span>
        ) : (
            <span className={"font-mono font-semibold tabular-nums"}>{table.table_number}</span>
        );

    return (
        <>
            {/* The page below the small breakpoint */}
            <ul className={"flex flex-col gap-2 sm:hidden"}>
                {tables.map((table) => (
                    <li
                        key={table.uuid}
                        className={clsx(
                            "flex flex-col gap-2 rounded-(--radius-card) bg-(--surface-card) px-4 py-3 ring-1",
                            own(table) ? "ring-2 ring-blue-500/50" : "ring-zinc-950/5 dark:ring-white/10",
                        )}
                    >
                        <div className={"flex items-center justify-between gap-3"}>
                            <span className={"text-sm font-semibold text-zinc-950 dark:text-white"}>
                                {table.is_bye
                                    ? t("label.bye")
                                    : t("label.table-number", { number: table.table_number })}
                            </span>
                            {!table.is_bye && result(table)}
                        </div>
                        <ul className={"flex flex-col gap-1"}>
                            {table.seats.map((seat) => (
                                <li key={seat.participant} className={"text-sm"}>
                                    {player(seat, !duels)}
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>

            <div className={"hidden sm:block"}>
                <Table dense={true} striped={true} className={"[--gutter:--spacing(3)]"}>
                    <TableHead>
                        <TableRow>
                            <TableHeader className={"w-16"}>{t("heading.table")}</TableHeader>
                            {duels ? (
                                <>
                                    <TableHeader>{t("heading.player-one")}</TableHeader>
                                    <TableHeader>{t("heading.player-two")}</TableHeader>
                                </>
                            ) : (
                                <TableHeader>{t("heading.players")}</TableHeader>
                            )}
                            <TableHeader className={"w-40"}>{t("heading.result")}</TableHeader>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {tables.map((table) => (
                            <TableRow
                                key={table.uuid}
                                className={clsx(own(table) && "ring-2 ring-blue-500/40 ring-inset")}
                            >
                                <TableCell>{number(table)}</TableCell>
                                {duels ? (
                                    <>
                                        <TableCell>{player(table.seats[0], false)}</TableCell>
                                        <TableCell>{player(table.seats[1], false)}</TableCell>
                                    </>
                                ) : (
                                    <TableCell>
                                        <span className={"flex flex-wrap items-center gap-x-4 gap-y-1"}>
                                            {table.seats.map((seat) => (
                                                <span key={seat.participant}>{player(seat, true)}</span>
                                            ))}
                                        </span>
                                    </TableCell>
                                )}
                                <TableCell>{result(table)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </>
    );
}
