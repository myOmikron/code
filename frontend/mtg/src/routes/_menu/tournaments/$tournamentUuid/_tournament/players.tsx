import {
    CheckCircleIcon,
    DocumentCheckIcon,
    DocumentMinusIcon,
    DocumentTextIcon,
    EllipsisHorizontalIcon,
    LockClosedIcon,
    PencilSquareIcon,
    PlusIcon,
    TrashIcon,
    XCircleIcon,
} from "@heroicons/react/20/solid";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import type { BadgeProps } from "components";
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
    EmptyState,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DecklistPolicy, ResponseError } from "src/api/generated";
import type { TournamentParticipantResponse } from "src/api/generated";
import { DecklistDialog } from "src/components/decklist-dialog";
import type { ParticipantDialogMode } from "src/components/participant-dialog";
import { ParticipantDialog } from "src/components/participant-dialog";
import { participantStatusColor, participantStatusLabelKey } from "src/components/tournament-join-code";
import { useAccount } from "src/context/account";
import { isFormError } from "src/utils/error";

/** The colour union {@link Badge} accepts, without the `undefined` a plain lookup would carry */
type BadgeColor = NonNullable<BadgeProps["color"]>;

/**
 * The colour a participant's decklist status badge reads best in
 *
 * Green once one is on file; missing only reads as a mere zinc note under
 * {@link DecklistPolicy.Optional} — it escalates to red once the tournament actually requires one.
 *
 * @param hasDecklist whether the participant has a decklist on file
 * @param policy the tournament's decklist policy
 *
 * @returns the badge colour
 */
function decklistBadgeColor(hasDecklist: boolean, policy: DecklistPolicy): BadgeColor {
    if (hasDecklist) return "green";
    return policy === DecklistPolicy.Optional ? "zinc" : "red";
}

/**
 * Which row a {@link DecklistDialog} opened from the roster is open on
 */
type DecklistDialogState = {
    /** The row the dialog was opened for */
    participant: TournamentParticipantResponse;
    /** Whether the viewer may link their own deck here — only ever their own row */
    canPickDeck: boolean;
};

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/players")({
    loader: async ({ params }) => {
        try {
            return await Api.tournaments.participants.list(params.tournamentUuid);
        } catch (error) {
            if (error instanceof ResponseError) return { participants: [] as Array<TournamentParticipantResponse> };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The roster: everybody registered, checked in, dropped or disqualified.
 *
 * A row's check-in/drop buttons appear twice over: once for the viewer's own row (self-service —
 * a guest on their phone checks themself in) and once inside the organizer menu for every row
 * (a TO checking a table full of walk-ins in one pass). Names shown are always `display_name`;
 * usernames belong to the organizer-management list, not here.
 *
 * @returns the page
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const { participants } = Route.useLoaderData();
    // Non-null: see the same assertion in `overview.tsx` — this tab never mounts on a `null`.
    const { tournament, viewer } = useLoaderData({ from: "/_menu/tournaments/$tournamentUuid/_tournament" })!;
    const [t] = useTranslation("tournament");
    const router = useRouter();
    const me = useAccount();

    const [dialog, setDialog] = useState<ParticipantDialogMode | null>(null);
    const [removing, setRemoving] = useState<TournamentParticipantResponse | null>(null);
    const [decklistDialog, setDecklistDialog] = useState<DecklistDialogState | null>(null);

    /**
     * Checks a participant in
     *
     * `checkIn`/`drop` bypass `handleError` (see `api.tsx`) so a guest whose session died mid-
     * event gets a page-rendered note instead of a login redirect it cannot complete — which
     * means a rejection here is this page's own to catch, not the global error screen's. Under
     * `DecklistPolicy.RequiredToCheckIn` a player with no decklist on file comes back as the typed
     * `decklist_missing` refusal rather than throwing — surfaced as a toast, same as every other
     * outcome on this button.
     *
     * @param participant the row to check in
     */
    async function checkIn(participant: TournamentParticipantResponse) {
        try {
            const response = await Api.tournaments.participants.checkIn(tournamentUuid, participant.uuid);
            if (isFormError(response)) {
                notify.error(t("error.decklist-missing"));
                return;
            }
            notify.success(t("toast.checked-in"));
        } catch (error) {
            console.error(error);
            notify.error(t("error.action-failed"));
        }
        await router.invalidate();
    }

    /**
     * Locks or unlocks every decklist in the tournament, tournament-wide — never per row.
     *
     * Goes through `handleError` like the rest of the management surface (see `api.tsx`): only an
     * organizer's own session can reach this button, so a rejection here is a genuine anomaly
     * worth the app's error screen, not a message this page renders itself.
     */
    async function toggleDecklistLock() {
        if (tournament.decklists_locked_at != null) {
            await Api.tournaments.decklists.unlock(tournamentUuid);
            notify.success(t("toast.decklists-unlocked"));
        } else {
            await Api.tournaments.decklists.lock(tournamentUuid);
            notify.success(t("toast.decklists-locked"));
        }
        await router.invalidate();
    }

    /**
     * Drops a participant from the event
     *
     * @param participant the row to drop
     */
    async function drop(participant: TournamentParticipantResponse) {
        try {
            await Api.tournaments.participants.drop(tournamentUuid, participant.uuid);
            notify.success(t("toast.dropped"));
        } catch (error) {
            console.error(error);
            notify.error(t("error.action-failed"));
        }
        await router.invalidate();
    }

    /**
     * Removes a participant outright, after the confirmation was accepted
     *
     * @param participant the row to remove
     */
    async function remove(participant: TournamentParticipantResponse) {
        setRemoving(null);
        await Api.tournaments.participants.remove(tournamentUuid, participant.uuid);
        notify.success(t("toast.player-removed"));
        await router.invalidate();
    }

    const addButton = viewer.is_organizer && (
        <Button onClick={() => setDialog({ kind: "add" })}>
            <PlusIcon />
            {t("button.add-player")}
        </Button>
    );

    // Tournament-wide, independent of whether the roster has any rows at all — an organizer may
    // lock decklists before a single player has registered.
    const toolbar = (
        <div className={"flex flex-wrap items-center justify-between gap-2"}>
            <div>
                {tournament.decklists_locked_at != null && (
                    <Badge color={"zinc"}>
                        <LockClosedIcon className={"size-4"} />
                        <span className={"max-sm:sr-only"}>{t("label.decklists-locked")}</span>
                    </Badge>
                )}
            </div>
            <div className={"flex gap-2"}>
                {viewer.may_manage && (
                    <Button outline={true} onClick={() => void toggleDecklistLock()}>
                        <LockClosedIcon />
                        {t(
                            tournament.decklists_locked_at != null
                                ? "button.unlock-decklists"
                                : "button.lock-decklists",
                        )}
                    </Button>
                )}
                {addButton}
            </div>
        </div>
    );

    const decklistDialogElement = (
        <DecklistDialog
            open={decklistDialog !== null}
            tournamentUuid={tournamentUuid}
            tournamentFormat={tournament.format}
            participant={{
                uuid: decklistDialog?.participant.uuid ?? "",
                display_name: decklistDialog?.participant.display_name ?? "",
            }}
            canPickDeck={decklistDialog?.canPickDeck ?? false}
            onClose={() => setDecklistDialog(null)}
            onChanged={() => void router.invalidate()}
        />
    );

    if (participants.length === 0) {
        return (
            <div className={"flex flex-col gap-4"}>
                {toolbar}
                <EmptyState title={t("label.no-players")} />
                <ParticipantDialog
                    tournamentUuid={tournamentUuid}
                    mode={dialog}
                    onClose={() => setDialog(null)}
                    onSaved={() => {
                        setDialog(null);
                        notify.success(t("toast.player-added"));
                        void router.invalidate();
                    }}
                />
                {decklistDialogElement}
            </div>
        );
    }

    return (
        <div className={"flex flex-col gap-4"}>
            {toolbar}

            <Table dense={true} striped={true}>
                <TableHead>
                    <TableRow>
                        <TableHeader>{t("label.name")}</TableHeader>
                        <TableHeader>{t("label.status")}</TableHeader>
                        <TableHeader>{t("label.decklist-text")}</TableHeader>
                        <TableHeader />
                    </TableRow>
                </TableHead>
                <TableBody>
                    {participants.map((participant) => {
                        const isOwn = viewer.participant === participant.uuid;
                        const canCheckIn = participant.status === "Registered";
                        const canDrop = participant.status === "Registered" || participant.status === "CheckedIn";

                        return (
                            <TableRow key={participant.uuid}>
                                <TableCell>
                                    <div className={"flex items-center gap-2"}>
                                        <span>{participant.display_name}</span>
                                        {participant.is_guest && <Badge color={"zinc"}>{t("label.guest")}</Badge>}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge color={participantStatusColor(participant.status)}>
                                        {t(participantStatusLabelKey(participant.status))}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        color={decklistBadgeColor(participant.has_decklist, tournament.decklist_policy)}
                                    >
                                        {participant.has_decklist ? (
                                            <DocumentCheckIcon className={"size-4"} />
                                        ) : (
                                            <DocumentMinusIcon className={"size-4"} />
                                        )}
                                        <span className={"max-sm:sr-only"}>
                                            {t(
                                                participant.has_decklist
                                                    ? "label.decklist-submitted"
                                                    : "label.decklist-missing",
                                            )}
                                        </span>
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className={"flex justify-end gap-2"}>
                                        {isOwn && canCheckIn && (
                                            <Button outline={true} onClick={() => void checkIn(participant)}>
                                                {t("button.check-in")}
                                            </Button>
                                        )}
                                        {isOwn && canDrop && (
                                            <Button outline={true} onClick={() => void drop(participant)}>
                                                {t("button.drop")}
                                            </Button>
                                        )}
                                        {viewer.is_organizer && (
                                            <Dropdown>
                                                <DropdownButton
                                                    plain={true}
                                                    aria-label={t("accessibility.player-actions", {
                                                        name: participant.display_name,
                                                    })}
                                                >
                                                    <EllipsisHorizontalIcon />
                                                </DropdownButton>
                                                <DropdownMenu anchor={"bottom end"}>
                                                    <DropdownItem
                                                        onClick={() => setDialog({ kind: "edit", participant })}
                                                    >
                                                        <PencilSquareIcon />
                                                        <DropdownLabel>{t("button.edit")}</DropdownLabel>
                                                    </DropdownItem>
                                                    <DropdownItem
                                                        onClick={() =>
                                                            setDecklistDialog({
                                                                participant,
                                                                // Staff paste a list for somebody
                                                                // else's row, they do not link
                                                                // their own deck onto it — unless
                                                                // this is their own row.
                                                                canPickDeck: isOwn && me.account !== null,
                                                            })
                                                        }
                                                    >
                                                        <DocumentTextIcon />
                                                        <DropdownLabel>{t("button.decklist")}</DropdownLabel>
                                                    </DropdownItem>
                                                    {!isOwn && canCheckIn && (
                                                        <DropdownItem onClick={() => void checkIn(participant)}>
                                                            <CheckCircleIcon />
                                                            <DropdownLabel>{t("button.check-in")}</DropdownLabel>
                                                        </DropdownItem>
                                                    )}
                                                    {!isOwn && canDrop && (
                                                        <DropdownItem onClick={() => void drop(participant)}>
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
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            <ParticipantDialog
                tournamentUuid={tournamentUuid}
                mode={dialog}
                onClose={() => setDialog(null)}
                onSaved={() => {
                    const wasAdd = dialog?.kind === "add";
                    setDialog(null);
                    notify.success(wasAdd ? t("toast.player-added") : t("toast.player-updated"));
                    void router.invalidate();
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
            {decklistDialogElement}
        </div>
    );
}
