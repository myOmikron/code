import {
    CheckCircleIcon,
    DocumentTextIcon,
    EllipsisHorizontalIcon,
    LockClosedIcon,
    MapPinIcon,
    PencilSquareIcon,
    PlusIcon,
    QrCodeIcon,
    TrashIcon,
    XCircleIcon,
} from "@heroicons/react/20/solid";
import {
    Badge,
    Button,
    ConfirmDialog,
    Dropdown,
    DropdownButton,
    DropdownDivider,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    Text,
    notify,
} from "components";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DecklistPolicy } from "src/api/generated";
import type { TournamentParticipantResponse, TournamentResponse, TournamentViewerResponse } from "src/api/generated";
import { ClaimQrDialog } from "src/components/claim-qr-dialog";
import { DecklistDialog } from "src/components/decklist-dialog";
import { FixedTableDialog } from "src/components/fixed-table-dialog";
import type { ParticipantDialogMode } from "src/components/participant-dialog";
import { ParticipantDialog } from "src/components/participant-dialog";
import { useAccount } from "src/context/account";
import { isFormError } from "src/utils/error";
import { isLimitedFormat } from "src/utils/tournament-format";

/**
 * Whether decklists matter for this event: not under {@link DecklistPolicy.Optional}, nor in limited
 *
 * @param tournament the tournament
 *
 * @returns whether the decklist state belongs on a row
 */
export function decklistMatters(tournament: TournamentResponse): boolean {
    return tournament.decklist_policy !== DecklistPolicy.Optional && !isLimitedFormat(tournament.format);
}

/**
 * The properties for {@link TournamentRoster}
 */
export type TournamentRosterProps = {
    /** The tournament the roster belongs to */
    tournamentUuid: string;
    /** The tournament itself, for its decklist policy and format */
    tournament: TournamentResponse;
    /** What the viewer may do here */
    viewer: TournamentViewerResponse;
    /** The roster, as the viewer is allowed to see it */
    participants: Array<TournamentParticipantResponse>;
    /** Called after anything on the roster changed */
    onChanged: () => void | Promise<void>;
};

/**
 * The roster in two columns, checked in and awaiting check-in, with dropped players folded below
 *
 * @returns the roster
 */
export function TournamentRoster({
    tournamentUuid,
    tournament,
    viewer,
    participants,
    onChanged,
}: TournamentRosterProps) {
    const [t] = useTranslation("tournament");
    const me = useAccount();

    const [dialog, setDialog] = useState<ParticipantDialogMode | null>(null);
    const [removing, setRemoving] = useState<TournamentParticipantResponse | null>(null);
    const [dropping, setDropping] = useState<TournamentParticipantResponse | null>(null);
    const [decklistFor, setDecklistFor] = useState<TournamentParticipantResponse | null>(null);
    const [claimQr, setClaimQr] = useState<TournamentParticipantResponse | null>(null);
    const [pinning, setPinning] = useState<TournamentParticipantResponse | null>(null);

    const checkedIn = participants.filter((participant) => participant.status === "CheckedIn");
    const waiting = participants.filter((participant) => participant.status === "Registered");
    const gone = participants.filter(
        (participant) => participant.status === "Dropped" || participant.status === "Disqualified",
    );
    const showsDecklist = decklistMatters(tournament);

    /**
     * Checks a player in
     *
     * @param participant the row to check in
     */
    async function checkIn(participant: TournamentParticipantResponse) {
        const response = await Api.tournaments.participants.checkIn(tournamentUuid, participant.uuid);
        // The only typed refusal is `decklist_missing`.
        if (isFormError(response)) {
            notify.error(t("error.decklist-missing"));
            return;
        }
        notify.success(t("toast.checked-in"));
        await onChanged();
    }

    /** Checks in everybody still waiting, one call per row */
    async function checkInEveryone() {
        let missing = 0;
        for (const participant of waiting) {
            const response = await Api.tournaments.participants.checkIn(tournamentUuid, participant.uuid);
            if (isFormError(response)) missing += 1;
        }
        if (missing > 0) notify.error(t("error.decklists-missing", { count: missing }));
        if (missing < waiting.length) notify.success(t("toast.checked-in"));
        await onChanged();
    }

    /**
     * Drops a player from the event, after the confirmation was accepted
     *
     * @param participant the row to drop
     */
    async function drop(participant: TournamentParticipantResponse) {
        setDropping(null);
        try {
            await Api.tournaments.participants.drop(tournamentUuid, participant.uuid);
            notify.success(t("toast.dropped"));
        } catch (error) {
            console.error(error);
            notify.error(t("error.action-failed"));
        }
        await onChanged();
    }

    /**
     * Removes a player outright, after the confirmation was accepted
     *
     * @param participant the row to remove
     */
    async function remove(participant: TournamentParticipantResponse) {
        setRemoving(null);
        const response = await Api.tournaments.participants.remove(tournamentUuid, participant.uuid);
        // The only typed refusal is `already_paired`.
        if (isFormError(response)) {
            notify.error(t("error.already-paired"));
            return;
        }
        notify.success(t("toast.player-removed"));
        await onChanged();
    }

    /** Locks or unlocks every decklist in the tournament */
    async function toggleDecklistLock() {
        if (tournament.decklists_locked_at != null) {
            await Api.tournaments.decklists.unlock(tournamentUuid);
            notify.success(t("toast.decklists-unlocked"));
        } else {
            await Api.tournaments.decklists.lock(tournamentUuid);
            notify.success(t("toast.decklists-locked"));
        }
        await onChanged();
    }

    /**
     * One roster row: who they are, and what the viewer may do about it
     *
     * @param participant the row to draw
     *
     * @returns the row
     */
    function row(participant: TournamentParticipantResponse) {
        const canCheckIn = participant.status === "Registered";
        // Before the start, removing the player is the same thing.
        const canDrop =
            tournament.status === "Running" &&
            (participant.status === "Registered" || participant.status === "CheckedIn");

        return (
            <li
                key={participant.uuid}
                className={
                    "flex items-center gap-3 border-t border-zinc-950/[0.06] px-4 py-2 first:border-t-0 focus-within:bg-zinc-950/[0.03] hover:bg-zinc-950/[0.03] dark:border-white/[0.06] dark:focus-within:bg-white/[0.04] dark:hover:bg-white/[0.04]"
                }
            >
                <div className={"flex min-w-0 flex-1 flex-col"}>
                    <span className={"truncate text-sm font-medium text-zinc-950 dark:text-white"}>
                        {participant.display_name}
                    </span>
                    <span className={"flex items-center gap-1.5 truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                        <span>{participant.is_guest ? t("label.guest") : t("label.account")}</span>
                        {participant.fixed_table != null && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span>{t("label.fixed-table-meta", { number: participant.fixed_table })}</span>
                            </>
                        )}
                        {showsDecklist && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span
                                    className={
                                        participant.has_decklist
                                            ? undefined
                                            : "font-medium text-red-600 dark:text-red-400"
                                    }
                                >
                                    {participant.has_decklist ? t("label.decklist-on-file") : t("label.decklist-none")}
                                </span>
                            </>
                        )}
                    </span>
                </div>

                <div className={"flex flex-none items-center gap-1"}>
                    {viewer.is_organizer && canCheckIn && (
                        <Button outline={true} onClick={() => void checkIn(participant)}>
                            <CheckCircleIcon />
                            <span className={"max-lg:sr-only"}>{t("button.check-in")}</span>
                        </Button>
                    )}
                    {viewer.is_organizer && (
                        <Dropdown>
                            <DropdownButton
                                plain={true}
                                aria-label={t("accessibility.player-actions", { name: participant.display_name })}
                            >
                                <EllipsisHorizontalIcon />
                            </DropdownButton>
                            <DropdownMenu anchor={"bottom end"}>
                                <DropdownItem onClick={() => setDialog({ kind: "edit", participant })}>
                                    <PencilSquareIcon />
                                    <DropdownLabel>{t("button.edit")}</DropdownLabel>
                                </DropdownItem>
                                {showsDecklist && (
                                    <DropdownItem onClick={() => setDecklistFor(participant)}>
                                        <DocumentTextIcon />
                                        <DropdownLabel>{t("button.decklist")}</DropdownLabel>
                                    </DropdownItem>
                                )}
                                <DropdownItem onClick={() => setPinning(participant)}>
                                    <MapPinIcon />
                                    <DropdownLabel>{t("button.fixed-table")}</DropdownLabel>
                                </DropdownItem>
                                {participant.is_guest && (
                                    <DropdownItem onClick={() => setClaimQr(participant)}>
                                        <QrCodeIcon />
                                        <DropdownLabel>{t("button.claim-qr")}</DropdownLabel>
                                    </DropdownItem>
                                )}
                                {canDrop && (
                                    <DropdownItem onClick={() => setDropping(participant)}>
                                        <XCircleIcon />
                                        <DropdownLabel>{t("button.drop")}</DropdownLabel>
                                    </DropdownItem>
                                )}
                                <DropdownDivider />
                                <DropdownItem onClick={() => setRemoving(participant)}>
                                    <TrashIcon />
                                    <DropdownLabel>{t("button.remove-player")}</DropdownLabel>
                                </DropdownItem>
                            </DropdownMenu>
                        </Dropdown>
                    )}
                </div>
            </li>
        );
    }

    /**
     * One column of the roster
     *
     * @param heading the column's heading
     * @param rows the rows it holds
     * @param action the control in its header, if any
     *
     * @returns the column
     */
    function column(heading: string, rows: Array<TournamentParticipantResponse>, action?: ReactNode) {
        return (
            <section
                className={
                    "flex flex-col rounded-(--radius-card) bg-(--surface-card) shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                }
            >
                <div
                    className={
                        "flex items-center justify-between gap-3 border-b border-zinc-950/[0.06] px-4 py-2.5 dark:border-white/[0.06]"
                    }
                >
                    <h2 className={"flex items-baseline gap-2 text-sm font-semibold text-zinc-950 dark:text-white"}>
                        {heading}
                        <span className={"font-medium text-zinc-500 tabular-nums dark:text-zinc-400"}>
                            {rows.length}
                        </span>
                    </h2>
                    {action}
                </div>
                {rows.length === 0 ? (
                    <Text className={"px-4 py-6 text-center text-sm"}>{t("label.no-players")}</Text>
                ) : (
                    <ul className={"flex flex-col"}>{rows.map(row)}</ul>
                )}
            </section>
        );
    }

    return (
        <div className={"flex flex-col gap-4"}>
            <div className={"flex flex-wrap items-center justify-end gap-2"}>
                {tournament.decklists_locked_at != null && (
                    <Badge color={"zinc"}>
                        <LockClosedIcon className={"size-4"} />
                        {t("label.decklists-locked")}
                    </Badge>
                )}
                {viewer.may_manage && showsDecklist && (
                    <Button outline={true} onClick={() => void toggleDecklistLock()}>
                        <LockClosedIcon />
                        {tournament.decklists_locked_at != null
                            ? t("button.unlock-decklists")
                            : t("button.lock-decklists")}
                    </Button>
                )}
                {viewer.is_organizer && (
                    <Button onClick={() => setDialog({ kind: "add" })}>
                        <PlusIcon />
                        {t("button.add-player")}
                    </Button>
                )}
            </div>

            <div className={"grid grid-cols-1 items-start gap-4 lg:grid-cols-2"}>
                {column(t("heading.checked-in"), checkedIn)}
                {column(
                    t("heading.awaiting-check-in"),
                    waiting,
                    viewer.is_organizer && waiting.length > 0 ? (
                        <Button outline={true} onClick={() => void checkInEveryone()}>
                            <CheckCircleIcon />
                            {t("button.check-in-all")}
                        </Button>
                    ) : undefined,
                )}
            </div>

            {gone.length > 0 && (
                <details
                    className={
                        "rounded-(--radius-card) bg-(--surface-card) px-4 py-2.5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                    }
                >
                    <summary className={"cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300"}>
                        {t("heading.dropped-out")} · {gone.length}
                    </summary>
                    <ul className={"mt-1 flex flex-col"}>{gone.map(row)}</ul>
                </details>
            )}

            <ParticipantDialog
                tournamentUuid={tournamentUuid}
                tournament={tournament}
                mode={dialog}
                onClose={() => setDialog(null)}
                onSaved={() => {
                    const wasAdd = dialog?.kind === "add";
                    setDialog(null);
                    notify.success(wasAdd ? t("toast.player-added") : t("toast.player-updated"));
                    void onChanged();
                }}
            />

            <ConfirmDialog
                open={removing !== null}
                onClose={() => setRemoving(null)}
                onConfirm={async () => {
                    if (removing !== null) await remove(removing);
                }}
                title={t("button.remove-player")}
                description={t("description.confirm-remove-player", { name: removing?.display_name ?? "" })}
                confirmLabel={t("button.remove-player")}
            />

            <ConfirmDialog
                open={dropping !== null}
                onClose={() => setDropping(null)}
                onConfirm={async () => {
                    if (dropping !== null) await drop(dropping);
                }}
                title={t("heading.drop-player")}
                description={t("description.confirm-drop-player", { name: dropping?.display_name ?? "" })}
                confirmLabel={t("button.drop")}
            />

            <DecklistDialog
                open={decklistFor !== null}
                tournamentUuid={tournamentUuid}
                tournamentFormat={tournament.format}
                participant={{
                    uuid: decklistFor?.uuid ?? "",
                    display_name: decklistFor?.display_name ?? "",
                }}
                // Staff only link their own deck on their own row.
                canPickDeck={decklistFor?.uuid === viewer.participant && me.account !== null}
                onClose={() => setDecklistFor(null)}
                onChanged={() => void onChanged()}
            />

            <FixedTableDialog
                tournamentUuid={tournamentUuid}
                participant={pinning}
                onClose={() => setPinning(null)}
                onSaved={() => void onChanged()}
            />

            <ClaimQrDialog
                open={claimQr !== null}
                tournamentUuid={tournamentUuid}
                participant={{ uuid: claimQr?.uuid ?? "", display_name: claimQr?.display_name ?? "" }}
                onClose={() => setClaimQr(null)}
            />
        </div>
    );
}

/**
 * The properties for {@link TournamentRosterList}
 */
export type TournamentRosterListProps = {
    /** The names to list, in the order they should read */
    names: Array<string>;
};

/**
 * The roster for non-staff readers: names only, no check-in state
 *
 * @returns the list
 */
export function TournamentRosterList({ names }: TournamentRosterListProps) {
    const [t] = useTranslation("tournament");

    return (
        <section
            className={
                "flex flex-col rounded-(--radius-card) bg-(--surface-card) shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
            }
        >
            <div
                className={
                    "flex items-baseline gap-2 border-b border-zinc-950/[0.06] px-4 py-2.5 text-sm font-semibold text-zinc-950 dark:border-white/[0.06] dark:text-white"
                }
            >
                {t("heading.registered")}
                <span className={"font-medium text-zinc-500 tabular-nums dark:text-zinc-400"}>{names.length}</span>
            </div>
            {names.length === 0 ? (
                <Text className={"px-4 py-6 text-center text-sm"}>{t("label.no-players")}</Text>
            ) : (
                <ul className={"flex flex-col"}>
                    {names.map((name, index) => (
                        <li
                            key={`${name}-${index}`}
                            className={
                                "truncate border-t border-zinc-950/[0.06] px-4 py-2 text-sm text-zinc-950 first:border-t-0 dark:border-white/[0.06] dark:text-white"
                            }
                        >
                            {name}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
