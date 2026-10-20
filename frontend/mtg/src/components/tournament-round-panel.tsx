import {
    ArrowPathIcon,
    ArrowsRightLeftIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    PlayIcon,
    PlusIcon,
    TrashIcon,
    UserGroupIcon,
} from "@heroicons/react/20/solid";
import { Badge, Button, ConfirmDialog, EmptyState, notify } from "components";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RoundKind, TimerActionRequest } from "src/api/generated";
import type {
    MatchTableResponse,
    RoundResponse,
    TournamentParticipantResponse,
    TournamentResponse,
    TournamentViewerResponse,
} from "src/api/generated";
import { TournamentPairingsEditor } from "src/components/tournament-pairings-editor";
import { TournamentPairingsTable } from "src/components/tournament-pairings-table";
import { TournamentRoundClock } from "src/components/tournament-round-clock";
import { isFormError } from "src/utils/error";
import { movedPins } from "src/utils/pairing-edit";
import { roundClockOf } from "src/utils/round-clock";
import { nextRoundKind } from "src/utils/tournament-format";

/** How long the unscored rounds run, in minutes; scored rounds use the event's setting */
const PRE_ROUND_MINUTES: Record<string, number> = {
    [RoundKind.Draft]: 50,
    [RoundKind.Deckbuilding]: 30,
};

/**
 * What a round is called: its number for a scored round, its kind otherwise
 *
 * @param round the round
 * @param t the `tournament` namespace translator
 *
 * @returns the heading
 */
export function roundTitle(round: RoundResponse, t: TFunction<"tournament">): string {
    if (round.number != null) return t("heading.round-number", { number: round.number });
    return round.kind === RoundKind.Draft ? t("heading.draft") : t("heading.deckbuilding");
}

/** The properties for {@link TournamentRoundPanel} */
export type TournamentRoundPanelProps = {
    /** The tournament being run */
    tournamentUuid: string;
    /** The tournament itself, for its round length and format */
    tournament: TournamentResponse;
    /** What the viewer may do here */
    viewer: TournamentViewerResponse;
    /** Every round so far, oldest first */
    rounds: Array<RoundResponse>;
    /** The round being shown, `null` before the first exists */
    round: RoundResponse | null;
    /** The shown round's tables, byes last */
    tables: Array<MatchTableResponse>;
    /** How far this device's clock is ahead of the server's */
    skewMs: number;
    /** The roster, for the desk's pairing editor */
    participants: Array<TournamentParticipantResponse>;
    /** Folds the tables away, for a player whose own table is shown above */
    collapseTables?: boolean;
    /** Called while the desk is editing, so a refresh does not land on it */
    onEditingChange?: (editing: boolean) => void;
    /** Called after anything changed */
    onChanged: () => void | Promise<void>;
};

/**
 * The screen a tournament is run from once it starts: the round rail, the shown round with its
 * clock and tables, and the desk's round lifecycle
 *
 * @returns the round screen
 */
export function TournamentRoundPanel({
    tournamentUuid,
    tournament,
    viewer,
    rounds,
    round,
    tables,
    skewMs,
    participants,
    collapseTables = false,
    onEditingChange,
    onChanged,
}: TournamentRoundPanelProps) {
    const [t] = useTranslation("tournament");
    const [confirmingComplete, setConfirmingComplete] = useState(false);
    const [editing, setEditing] = useState(false);
    const [tablesOpen, setTablesOpen] = useState(false);

    /**
     * Opens or closes the desk's pairing editor
     *
     * @param next whether it is open
     */
    function edit(next: boolean) {
        setEditing(next);
        onEditingChange?.(next);
    }

    const staff = viewer.is_organizer;
    const newest = rounds.at(-1)?.uuid;
    // Earlier rounds are only opened to correct a result; their clock and lifecycle stay put.
    const latest = round !== null && round.uuid === newest;
    const playedRounds = rounds.filter((entry) => entry.number != null).length;
    const kind = nextRoundKind(tournament.format, rounds);
    const clock = round === null ? null : roundClockOf(round);

    /**
     * Adds the round the format calls for next
     */
    async function addRound() {
        const response = await Api.tournaments.rounds.create(tournamentUuid, {
            kind,
            minutes: PRE_ROUND_MINUTES[kind] ?? tournament.round_minutes,
        });
        if (isFormError(response)) {
            notify.error(t("error.round-refused"));
            return;
        }
        await onChanged();
    }

    /**
     * Hands the round to the room and starts its clock
     */
    async function startRound() {
        if (round === null) return;
        const response = await Api.tournaments.rounds.start(tournamentUuid, round.uuid);
        if (isFormError(response)) {
            notify.error(response.error.not_paired ? t("error.not-paired") : t("error.round-refused"));
            return;
        }
        await onChanged();
    }

    /**
     * Closes the round
     */
    async function completeRound() {
        if (round === null) return;
        setConfirmingComplete(false);
        const response = await Api.tournaments.rounds.complete(tournamentUuid, round.uuid, true);
        if (isFormError(response)) {
            notify.error(t("error.round-refused"));
            return;
        }
        await onChanged();
    }

    /**
     * Throws away a round nobody has played
     */
    async function discardRound() {
        if (round === null) return;
        await Api.tournaments.rounds.delete(tournamentUuid, round.uuid);
        await onChanged();
    }

    /**
     * Works the clock
     *
     * @param action what the desk pressed
     * @param seconds the amount, for the actions that take one
     */
    async function timer(action: TimerActionRequest, seconds?: number) {
        if (round === null) return;
        await Api.tournaments.rounds.timer(tournamentUuid, round.uuid, action, seconds);
        await onChanged();
    }

    /**
     * Pairs the round, replacing any earlier pairing; the server refuses once a table is reported
     */
    async function pairRound() {
        if (round === null) return;
        const response = await Api.tournaments.rounds.pair(tournamentUuid, round.uuid);
        if (isFormError(response)) {
            const refusal = response.error;
            notify.error(
                refusal.impossible_pods
                    ? t("error.impossible-pods")
                    : refusal.results_reported
                      ? t("error.results-reported")
                      : refusal.no_entrants
                        ? t("error.no-entrants")
                        : t("error.not-pairable"),
            );
            return;
        }
        for (const pin of movedPins(response.tables, response.fixed_table_conflicts)) {
            notify.warning(t("toast.fixed-table-taken", pin));
        }
        await onChanged();
    }

    const addButton = <AddRound kind={kind} nextNumber={playedRounds + 1} onAdd={addRound} />;

    if (round === null) {
        return (
            <div className={"flex flex-col gap-4"}>
                <EmptyState
                    icon={<PlayIcon />}
                    title={t("heading.no-rounds")}
                    description={staff ? t("description.no-rounds") : t("description.no-rounds-player")}
                    action={staff ? addButton : undefined}
                />
            </div>
        );
    }

    return (
        <div className={"flex flex-col gap-4"}>
            {/* The newest round keeps the bare address, so a bookmark always shows the current one. */}
            {rounds.length > 1 && (
                <nav aria-label={t("accessibility.round-rail")} className={"flex flex-wrap gap-1.5"}>
                    {rounds.map((entry) => {
                        const current = entry.uuid === round.uuid;
                        return (
                            <Link
                                key={entry.uuid}
                                to={"/tournaments/$tournamentUuid"}
                                params={{ tournamentUuid }}
                                search={entry.uuid === newest ? {} : { round: entry.sequence }}
                                // Otherwise the newest chip, with an empty search, is active everywhere.
                                activeOptions={{ exact: true, includeSearch: true }}
                                className={clsx(
                                    "rounded-(--radius-pill) px-3 py-1 text-sm font-medium transition-colors",
                                    current
                                        ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                                        : "text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-white/10",
                                )}
                            >
                                {roundTitle(entry, t)}
                            </Link>
                        );
                    })}
                </nav>
            )}

            {!collapseTables && (
                <div
                    className={
                        "flex flex-wrap items-center gap-x-6 gap-y-4 rounded-(--radius-card) bg-(--surface-card) px-5 py-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                    }
                >
                    <div className={"flex min-w-0 flex-col gap-1"}>
                        <span
                            className={
                                "text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            }
                        >
                            {tournament.planned_rounds != null && round.number != null
                                ? t("label.round-of", { number: round.number, total: tournament.planned_rounds })
                                : t("heading.rounds")}
                        </span>
                        <span className={"text-2xl/8 font-semibold text-zinc-950 dark:text-white"}>
                            {roundTitle(round, t)}
                        </span>
                    </div>

                    <Badge
                        color={round.status === "Complete" ? "zinc" : round.status === "Running" ? "emerald" : "sky"}
                    >
                        {t(`label.round-status-${round.status.toLowerCase()}`)}
                    </Badge>

                    <div className={"ms-auto flex flex-wrap items-center gap-3"}>
                        <TournamentRoundClock
                            clock={clock}
                            skewMs={skewMs}
                            canControl={staff && latest && round.status === "Running"}
                            onStart={() => void timer(TimerActionRequest.Start)}
                            onPause={() => void timer(TimerActionRequest.Pause)}
                            onResume={() => void timer(TimerActionRequest.Resume)}
                            onAdjust={(seconds) => void timer(TimerActionRequest.Adjust, seconds)}
                        />
                    </div>
                </div>
            )}

            {round.kind === RoundKind.Deckbuilding ? (
                <EmptyState
                    icon={<PlayIcon />}
                    title={t("heading.deckbuilding")}
                    description={t("description.deckbuilding-running")}
                />
            ) : tables.length === 0 ? (
                <EmptyState
                    icon={<UserGroupIcon />}
                    title={t("heading.no-pairings")}
                    description={staff ? t("description.no-pairings") : t("description.no-pairings-player")}
                />
            ) : editing ? (
                <TournamentPairingsEditor
                    tournamentUuid={tournamentUuid}
                    round={round}
                    tables={tables}
                    podSize={round.pod_size ?? tournament.pod_size}
                    participants={participants}
                    onDone={async (saved) => {
                        edit(false);
                        if (saved) await onChanged();
                    }}
                />
            ) : collapseTables && !tablesOpen ? (
                <button
                    type={"button"}
                    aria-expanded={false}
                    onClick={() => setTablesOpen(true)}
                    className={
                        "flex items-center justify-between rounded-(--radius-card) bg-(--surface-card) px-4 py-3 text-sm font-medium text-zinc-700 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:text-zinc-200 dark:ring-white/10"
                    }
                >
                    {t("heading.all-tables")}
                    <ChevronRightIcon className={"size-4"} aria-hidden={true} />
                </button>
            ) : (
                <div className={"flex flex-col gap-3"}>
                    {staff && latest && round.status !== "Complete" && (
                        <div className={"flex justify-end gap-2"}>
                            <Button plain={true} onClick={() => void pairRound()}>
                                <ArrowPathIcon />
                                {t("button.repair")}
                            </Button>
                            <Button outline={true} onClick={() => edit(true)}>
                                <ArrowsRightLeftIcon />
                                {t("button.edit-pairings")}
                            </Button>
                        </div>
                    )}
                    <TournamentPairingsTable
                        tables={tables}
                        ownParticipant={viewer.participant}
                        tournamentUuid={tournamentUuid}
                        gamesPerMatch={tournament.games_per_match}
                        canEdit={staff}
                        onChanged={onChanged}
                    />
                </div>
            )}

            {staff && latest && !editing && (
                <div className={"flex flex-wrap items-center justify-end gap-2"}>
                    {round.status === "Pairing" && (
                        <>
                            <Button plain={true} onClick={() => void discardRound()}>
                                <TrashIcon />
                                {t("button.discard-round")}
                            </Button>
                            {/* Pair first, then start, in the same spot; deckbuilding has nothing to pair. */}
                            {round.kind !== RoundKind.Deckbuilding && tables.length === 0 ? (
                                <Button onClick={() => void pairRound()}>
                                    <UserGroupIcon />
                                    {t("button.auto-pair")}
                                </Button>
                            ) : (
                                <Button onClick={() => void startRound()}>
                                    <PlayIcon />
                                    {t("button.start-round")}
                                </Button>
                            )}
                        </>
                    )}
                    {round.status === "Running" && (
                        <Button onClick={() => setConfirmingComplete(true)}>
                            <CheckCircleIcon />
                            {t("button.finish-round")}
                        </Button>
                    )}
                    {round.status === "Complete" && addButton}
                </div>
            )}

            <ConfirmDialog
                open={confirmingComplete}
                onClose={() => setConfirmingComplete(false)}
                onConfirm={completeRound}
                title={t("heading.finish-round")}
                description={t("description.confirm-finish-round")}
                confirmLabel={t("button.finish-round")}
                confirmColor={"blue"}
            />
        </div>
    );
}

/** The properties for {@link AddRound} */
type AddRoundProps = {
    /** The kind of round the format calls for next */
    kind: RoundKind;
    /** Which number a scored round would take */
    nextNumber: number;
    /** Adds the round */
    onAdd: () => void | Promise<void>;
};

/**
 * The button that adds the next round, named for what it adds
 *
 * @returns the button
 */
function AddRound({ kind, nextNumber, onAdd }: AddRoundProps) {
    const [t] = useTranslation("tournament");

    const label =
        kind === RoundKind.Draft
            ? t("button.add-draft")
            : kind === RoundKind.Deckbuilding
              ? t("button.add-deckbuilding")
              : t("button.add-round-number", { number: nextNumber });

    return (
        <Button onClick={() => void onAdd()}>
            <PlusIcon />
            {label}
        </Button>
    );
}
