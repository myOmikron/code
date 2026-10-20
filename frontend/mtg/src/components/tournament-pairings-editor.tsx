import { ArrowsRightLeftIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { Badge, Button, PrimaryButton, notify } from "components";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MatchTableResponse, RoundResponse, TournamentParticipantResponse } from "src/api/generated";
import { isFormError } from "src/utils/error";
import type { EditLayout } from "src/utils/pairing-edit";
import {
    canMove,
    hasFreeSeat,
    isMovable,
    isRematch,
    layoutFrom,
    move,
    movedPins,
    movedPlayers,
    swap,
    toRequest,
} from "src/utils/pairing-edit";

/** The properties for {@link TournamentPairingsEditor} */
export type TournamentPairingsEditorProps = {
    /** The tournament being run */
    tournamentUuid: string;
    /** The round being edited */
    round: RoundResponse;
    /** Its tables, byes last */
    tables: Array<MatchTableResponse>;
    /** How many a full table seats */
    podSize: number;
    /** The roster, for players checked in after the pairing */
    participants: Array<TournamentParticipantResponse>;
    /** Called when the desk is done, with whether anything was saved */
    onDone: (saved: boolean) => void | Promise<void>;
};

/**
 * The desk's hand edit of a round: tap two players to swap them, or a player and a free seat to
 * move them; tables with a result are locked
 *
 * @returns the editor
 */
export function TournamentPairingsEditor({
    tournamentUuid,
    round,
    tables,
    podSize,
    participants,
    onDone,
}: TournamentPairingsEditorProps) {
    const [t] = useTranslation("tournament");

    const base = useMemo(() => {
        const seated = new Set(tables.flatMap((table) => table.seats.map((seat) => seat.participant)));
        const unseated = participants
            .filter((entry) => entry.status === "CheckedIn" && !seated.has(entry.uuid))
            .map((entry) => entry.uuid);
        return layoutFrom(tables, unseated);
    }, [tables, participants]);
    const [layout, setLayout] = useState<EditLayout>(base);
    const [picked, setPicked] = useState<string | null>(null);
    const [meetings, setMeetings] = useState<Array<[string, string]>>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        void Api.tournaments.rounds.meetings(tournamentUuid, round.uuid).then((response) => {
            setMeetings(response.meetings.map((meeting) => [meeting.a, meeting.b]));
        });
    }, [tournamentUuid, round.uuid]);

    const names = useMemo(() => {
        const map = new Map<string, string>();
        for (const entry of participants) map.set(entry.uuid, entry.display_name);
        for (const table of tables) for (const seat of table.seats) map.set(seat.participant, seat.display_name);
        return map;
    }, [participants, tables]);
    const moved = movedPlayers(base, layout);

    /**
     * Picks a player up, puts them down again, or swaps them with the one already picked
     *
     * @param player who was tapped
     */
    function tap(player: string) {
        if (picked === null) setPicked(player);
        else if (picked === player) setPicked(null);
        else {
            setLayout((current) => swap(current, picked, player));
            setPicked(null);
        }
    }

    /**
     * Moves the picked player onto a table's free seat
     *
     * @param table index of the table
     */
    function seat(table: number) {
        if (picked === null) return;
        setLayout((current) => move(current, picked, table, podSize));
        setPicked(null);
    }

    /**
     * Sends the layout
     */
    async function save() {
        setSaving(true);
        try {
            const response = await Api.tournaments.rounds.arrange(tournamentUuid, round.uuid, toRequest(layout));
            if (isFormError(response)) {
                const refusal = response.error;
                notify.error(
                    refusal.reported_tables.length > 0
                        ? t("error.tables-reported", {
                              count: refusal.reported_tables.length,
                              tables: refusal.reported_tables.join(", "),
                          })
                        : refusal.invalid_layout
                          ? t("error.invalid-layout")
                          : t("error.not-pairable"),
                );
                return;
            }
            for (const pin of movedPins(response.tables, response.fixed_table_conflicts)) {
                notify.warning(t("toast.fixed-table-taken", pin));
            }
            await onDone(true);
        } finally {
            setSaving(false);
        }
    }

    /**
     * One player as a tappable chip
     *
     * @param player who
     *
     * @returns the chip
     */
    const chip = (player: string) => {
        const movable = isMovable(layout, player);
        const name = names.get(player) ?? "";
        return (
            <button
                key={player}
                type={"button"}
                disabled={!movable}
                aria-pressed={picked === player}
                aria-label={t("accessibility.pick-player", { name })}
                onClick={() => tap(player)}
                className={clsx(
                    "rounded-lg px-2.5 py-1 text-left text-sm/6 font-medium text-zinc-950 transition-colors dark:text-white",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
                    movable && "ring-1 ring-zinc-950/15 hover:ring-blue-500 dark:ring-white/20",
                    picked === player && "bg-blue-500/10 ring-2 ring-blue-500!",
                    picked !== player && moved.has(player) && "bg-amber-500/15",
                    !movable && "cursor-default",
                )}
            >
                {name}
            </button>
        );
    };

    return (
        <div
            className={
                "flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
            }
        >
            <div
                className={
                    "flex items-center gap-2 bg-blue-500/10 px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-200"
                }
            >
                <ArrowsRightLeftIcon className={"size-4 shrink-0"} aria-hidden={true} />
                <span>
                    {picked === null ? t("label.swap-hint") : t("label.swap-with", { name: names.get(picked) ?? "" })}
                </span>
            </div>

            <ul className={"divide-y divide-zinc-950/5 dark:divide-white/10"}>
                {layout.tables.map((table, index) => {
                    const free = hasFreeSeat(table, podSize);
                    const armed = picked !== null && canMove(layout, picked, index, podSize);
                    return (
                        <li key={table.key} className={"flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"}>
                            <span
                                className={clsx(
                                    "w-16 shrink-0 text-sm font-semibold text-zinc-950 dark:text-white",
                                    !table.isBye && "font-mono tabular-nums",
                                )}
                            >
                                {table.isBye ? t("label.bye") : table.number}
                            </span>
                            <div className={"flex min-w-0 flex-1 flex-wrap items-center gap-1.5"}>
                                {table.seats.map(chip)}
                                {free && (picked === null || armed) && (
                                    <button
                                        type={"button"}
                                        disabled={!armed}
                                        onClick={() => seat(index)}
                                        className={clsx(
                                            "rounded-lg border border-dashed px-2.5 py-1 text-sm/6",
                                            armed
                                                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                                : "border-zinc-950/20 text-zinc-500 dark:border-white/20 dark:text-zinc-400",
                                        )}
                                    >
                                        {armed ? t("button.seat-here") : t("label.free-seat")}
                                    </button>
                                )}
                            </div>
                            {table.locked ? (
                                <span className={"flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"}>
                                    <LockClosedIcon className={"size-3.5"} aria-hidden={true} />
                                    {t("label.result-in")}
                                </span>
                            ) : (
                                !table.isBye &&
                                isRematch(table, meetings) && <Badge color={"amber"}>{t("label.rematch")}</Badge>
                            )}
                        </li>
                    );
                })}
            </ul>

            {(layout.tray.length > 0 || base.tray.length > 0) && (
                <div
                    className={
                        "flex flex-wrap items-center gap-2 border-t border-zinc-950/5 bg-zinc-950/[2.5%] px-4 py-2.5 dark:border-white/10 dark:bg-white/[2.5%]"
                    }
                >
                    <span className={"text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"}>
                        {t("label.unseated")}
                    </span>
                    {layout.tray.length > 0 ? (
                        layout.tray.map(chip)
                    ) : (
                        <span className={"text-sm text-zinc-500 dark:text-zinc-400"}>{t("label.nobody")}</span>
                    )}
                </div>
            )}

            <div
                className={
                    "sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-950/5 bg-(--surface-card) px-4 py-3 dark:border-white/10"
                }
            >
                <span className={"me-auto text-sm text-zinc-600 dark:text-zinc-300"}>
                    {moved.size > 0 ? t("label.players-moved", { count: moved.size }) : t("label.nothing-moved")}
                </span>
                <Button plain={true} onClick={() => void onDone(false)}>
                    {t("button.discard-changes")}
                </Button>
                <PrimaryButton disabled={saving || moved.size === 0} onClick={() => void save()}>
                    {t("button.save")}
                </PrimaryButton>
            </div>
        </div>
    );
}
