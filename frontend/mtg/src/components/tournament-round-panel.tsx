import {
    ArrowPathIcon,
    CheckCircleIcon,
    PlayIcon,
    PlusIcon,
    TrashIcon,
    UserGroupIcon,
} from "@heroicons/react/20/solid";
import { Badge, Button, ConfirmDialog, EmptyState, Listbox, ListboxLabel, ListboxOption, notify } from "components";
import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RoundKind, TimerActionRequest } from "src/api/generated";
import type {
    MatchTableResponse,
    RoundResponse,
    TournamentResponse,
    TournamentViewerResponse,
} from "src/api/generated";
import { TournamentPairingsTable } from "src/components/tournament-pairings-table";
import { TournamentRoundClock } from "src/components/tournament-round-clock";
import { isFormError } from "src/utils/error";
import type { RoundClock } from "src/utils/round-clock";

/**
 * How long a round of each kind runs for by default, in minutes
 *
 * A scored round takes the event's own setting. The other two are conventions rather than
 * settings: a draft takes about as long as a round of play, and deckbuilding is the half hour the
 * Magic Tournament Rules give a sealed pool.
 */
const PRE_ROUND_MINUTES: Record<string, number> = {
    [RoundKind.Draft]: 50,
    [RoundKind.Deckbuilding]: 30,
};

/**
 * What a round of this kind is called
 *
 * A scored round is "Runde 3"; the other two are named rather than numbered, which is the whole
 * point of them not carrying a number.
 *
 * @param round the round
 * @param t the `tournament` namespace translator
 *
 * @returns the heading
 */
export function roundTitle(round: RoundResponse, t: TFunction<"tournament">): string {
    if (round.number !== null && round.number !== undefined) {
        return t("heading.round-number", { number: round.number });
    }
    return round.kind === RoundKind.Draft ? t("heading.draft") : t("heading.deckbuilding");
}

/**
 * The properties for {@link TournamentRoundPanel}
 */
export type TournamentRoundPanelProps = {
    /** The tournament being run */
    tournamentUuid: string;
    /** The tournament itself, for its round length and format */
    tournament: TournamentResponse;
    /** What the viewer may do here */
    viewer: TournamentViewerResponse;
    /** Every round so far, oldest first */
    rounds: Array<RoundResponse>;
    /** The current round's tables, byes last */
    tables: Array<MatchTableResponse>;
    /** How far this device's clock is ahead of the server's */
    skewMs: number;
    /** Called after anything changed */
    onChanged: () => void | Promise<void>;
};

/**
 * The screen a tournament is run from once it starts: which round the room is on, and its clock.
 *
 * Pairings and results land on top of this in the next milestone; what it already owns is the part
 * every round needs regardless — adding the round, handing it to the room, running its clock and
 * closing it.
 *
 * @returns the round screen
 */
export function TournamentRoundPanel({
    tournamentUuid,
    tournament,
    viewer,
    rounds,
    tables,
    skewMs,
    onChanged,
}: TournamentRoundPanelProps) {
    const [t] = useTranslation("tournament");
    const [kind, setKind] = useState<RoundKind>(RoundKind.Swiss);
    const [confirmingComplete, setConfirmingComplete] = useState(false);

    const round = rounds.at(-1) ?? null;
    const staff = viewer.is_organizer;
    const playedRounds = rounds.filter((entry) => entry.number !== null && entry.number !== undefined).length;

    const clock: RoundClock | null =
        round === null
            ? null
            : {
                  endsAt: round.timer.ends_at ?? null,
                  pausedAt: round.timer.paused_at ?? null,
                  lengthSeconds: round.timer.length_seconds,
              };

    /**
     * Adds a round of the chosen kind
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
        // Back to a scored round: a draft or deckbuilding stage happens once, and leaving the
        // picker on it would make the next round — the common case — take two clicks and invite
        // adding a second pre-round by accident.
        setKind(RoundKind.Swiss);
        await onChanged();
    }

    /**
     * Hands the round to the room and starts its clock
     */
    async function startRound() {
        if (round === null) return;
        await Api.tournaments.rounds.start(tournamentUuid, round.uuid);
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
     * Pair the round, replacing whatever it already held
     *
     * One call for both the first pairing and every re-pair: the server refuses once a table has
     * been reported, which is the only state where replacing a layout would lose something.
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
        // A pin the layout could not honour is worth saying out loud: the round is perfectly
        // valid, but somebody who cannot leave their table is not at the one they asked for.
        for (const conflict of response.fixed_table_conflicts) {
            notify.warning(t("toast.fixed-table-taken", { number: conflict.table_number }));
        }
        await onChanged();
    }

    if (round === null) {
        return (
            <div className={"flex flex-col gap-4"}>
                <EmptyState
                    icon={<PlayIcon />}
                    title={t("heading.no-rounds")}
                    description={staff ? t("description.no-rounds") : t("description.no-rounds-player")}
                    action={staff ? <AddRound kind={kind} onKind={setKind} onAdd={addRound} /> : undefined}
                />
            </div>
        );
    }

    return (
        <div className={"flex flex-col gap-4"}>
            <div
                className={
                    "flex flex-wrap items-center gap-x-6 gap-y-4 rounded-(--radius-card) bg-(--surface-card) px-5 py-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                }
            >
                <div className={"flex min-w-0 flex-col gap-1"}>
                    <span className={"text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"}>
                        {tournament.planned_rounds != null && round.number != null
                            ? t("label.round-of", { number: round.number, total: tournament.planned_rounds })
                            : t("heading.rounds")}
                    </span>
                    <span className={"text-2xl/8 font-semibold text-zinc-950 dark:text-white"}>
                        {roundTitle(round, t)}
                    </span>
                </div>

                <Badge color={round.status === "Complete" ? "zinc" : round.status === "Running" ? "emerald" : "sky"}>
                    {t(`label.round-status-${round.status.toLowerCase()}`)}
                </Badge>

                <div className={"ms-auto flex flex-wrap items-center gap-3"}>
                    <TournamentRoundClock
                        clock={clock}
                        skewMs={skewMs}
                        canControl={staff && round.status === "Running"}
                        onStart={() => void timer(TimerActionRequest.Start)}
                        onPause={() => void timer(TimerActionRequest.Pause)}
                        onResume={() => void timer(TimerActionRequest.Resume)}
                        onAdjust={(seconds) => void timer(TimerActionRequest.Adjust, seconds)}
                    />
                </div>
            </div>

            {/* A deckbuilding stage has no tables at all — it is a clock and a room full of people
                opening boosters — so it says what is happening rather than "no pairings yet". */}
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
                    action={
                        staff && round.status !== "Complete" ? (
                            <Button onClick={() => void pairRound()}>
                                <UserGroupIcon />
                                {t("button.auto-pair")}
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <div className={"flex flex-col gap-3"}>
                    {staff && round.status !== "Complete" && (
                        <div className={"flex justify-end"}>
                            {/* Re-pairing keeps the round and its clock and replaces only the
                                tables, so an organizer who does not like a layout loses nothing by
                                asking for another one. */}
                            <Button plain={true} onClick={() => void pairRound()}>
                                <ArrowPathIcon />
                                {t("button.repair")}
                            </Button>
                        </div>
                    )}
                    <TournamentPairingsTable tables={tables} ownParticipant={viewer.participant} />
                </div>
            )}

            {staff && (
                <div className={"flex flex-wrap items-center justify-end gap-2"}>
                    {round.status === "Pairing" && (
                        <>
                            <Button plain={true} onClick={() => void discardRound()}>
                                <TrashIcon />
                                {t("button.discard-round")}
                            </Button>
                            <Button onClick={() => void startRound()}>
                                <PlayIcon />
                                {t("button.start-round")}
                            </Button>
                        </>
                    )}
                    {round.status === "Running" && (
                        <Button onClick={() => setConfirmingComplete(true)}>
                            <CheckCircleIcon />
                            {t("button.finish-round")}
                        </Button>
                    )}
                    {round.status === "Complete" && (
                        <AddRound kind={kind} onKind={setKind} onAdd={addRound} nextNumber={playedRounds + 1} />
                    )}
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

/**
 * The properties for {@link AddRound}
 */
type AddRoundProps = {
    /** The kind of round the picker is on */
    kind: RoundKind;
    /** Called when the picker moves */
    onKind: (kind: RoundKind) => void;
    /** Adds the round */
    onAdd: () => void | Promise<void>;
    /** Which number a scored round would take, when that is worth saying */
    nextNumber?: number;
};

/**
 * The kind picker and the button that adds a round.
 *
 * A picker rather than three buttons: a draft or deckbuilding stage is added once per event and a
 * scored round is added every time, so the common case should be one click on a control that is
 * already on the right answer.
 *
 * @returns the control
 */
function AddRound({ kind, onKind, onAdd, nextNumber }: AddRoundProps) {
    const [t] = useTranslation("tournament");

    return (
        <div className={"flex flex-wrap items-center gap-2"}>
            <Listbox value={kind} onChange={onKind} className={"max-w-56"}>
                <ListboxOption value={RoundKind.Swiss}>
                    <ListboxLabel>
                        {nextNumber === undefined
                            ? t("label.round-kind-swiss")
                            : t("heading.round-number", { number: nextNumber })}
                    </ListboxLabel>
                </ListboxOption>
                <ListboxOption value={RoundKind.Draft}>
                    <ListboxLabel>{t("heading.draft")}</ListboxLabel>
                </ListboxOption>
                <ListboxOption value={RoundKind.Deckbuilding}>
                    <ListboxLabel>{t("heading.deckbuilding")}</ListboxLabel>
                </ListboxOption>
            </Listbox>
            <Button onClick={() => void onAdd()}>
                <PlusIcon />
                {t("button.add-round")}
            </Button>
        </div>
    );
}
