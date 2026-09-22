import { PencilSquareIcon } from "@heroicons/react/20/solid";
import { Badge } from "components";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { MatchTableResponse } from "src/api/generated";

/**
 * The properties for {@link TournamentResultCell}
 */
export type TournamentResultCellProps = {
    /** The table */
    table: MatchTableResponse;
    /** Whether the viewer may write results here */
    canEdit: boolean;
    /** Opens the result dialog on this table */
    onEdit: () => void;
};

/**
 * What happened at one table, and the way in to saying so.
 *
 * The result itself is empty until there is something to say — a table nobody has reported
 * shows no badge — but the pencil is always drawn: the desk found a result cell with no visible
 * way in hard to discover, and a small grey glyph on every line is a quieter wall than forty
 * badges would be. The cell is a button across its whole width, so entering a result is one
 * click and one tab stop; the row around it opens the same dialog, see the pairings table.
 *
 * @returns the cell
 */
export function TournamentResultCell({ table, canEdit, onEdit }: TournamentResultCellProps) {
    const [t] = useTranslation("tournament");

    if (table.is_bye) return <Badge color={"emerald"}>{t("label.bye")}</Badge>;

    const winner = table.seats.find((seat) => seat.participant === table.winner);
    const settled = table.status === "Confirmed";

    // The score, in the order the two player columns are printed, so "2:0" reads
    // left to right across the row and needs no name to disambiguate it. A pod
    // is best of one, where the score is always some arrangement of a single
    // game and says nothing — there the winner's name is the result.
    const duel = table.seats.length === 2;
    const said = settled ? (
        <span className={clsx(duel && "font-mono tabular-nums", "text-zinc-950 dark:text-white")}>
            {duel
                ? `${table.seats[0].games_won}:${table.seats[1].games_won}`
                : table.is_draw
                  ? t("label.draw")
                  : (winner?.display_name ?? "—")}
        </span>
    ) : table.status === "Disputed" ? (
        <Badge color={"red"}>{t("label.disputed")}</Badge>
    ) : table.status === "Pending" ? (
        <Badge color={"amber"}>{t("label.pending")}</Badge>
    ) : null;

    if (!canEdit) return said;

    return (
        <button
            type={"button"}
            onClick={(event) => {
                // The row behind this cell opens the same dialog; one click must not open it twice.
                event.stopPropagation();
                onEdit();
            }}
            aria-label={
                settled
                    ? t("accessibility.edit-result", { number: table.table_number })
                    : t("accessibility.enter-result", { number: table.table_number })
            }
            className={clsx(
                "group flex w-full items-center justify-between gap-2 rounded-(--radius-control) px-2 py-1 text-left",
                "transition-colors hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:-outline-offset-2",
                "focus-visible:outline-blue-500 dark:hover:bg-white/10",
            )}
        >
            {said}
            <PencilSquareIcon
                aria-hidden={true}
                className={clsx(
                    "size-4 shrink-0 text-zinc-400 transition-colors dark:text-zinc-500",
                    "group-hover:text-zinc-700 group-focus-visible:text-zinc-700 dark:group-hover:text-zinc-200 dark:group-focus-visible:text-zinc-200",
                )}
            />
        </button>
    );
}
