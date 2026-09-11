import { GlobeAltIcon, LinkIcon, LockClosedIcon, NoSymbolIcon, PencilSquareIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import {
    Badge,
    Button,
    ConfirmDialog,
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    EmptyState,
    Listbox,
    ListboxDescription,
    ListboxLabel,
    ListboxOption,
    Text,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Visibility } from "src/api/generated";
import type { PairingSystem, TournamentStatus } from "src/api/generated";
import { ShareDialog } from "src/components/share-dialog";
import { TournamentDialog } from "src/components/tournament-dialog";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import { tournamentShareTarget } from "src/utils/share-targets";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/settings")({
    component: RouteComponent,
});

/**
 * The translation key naming a pairing system
 *
 * @param system the pairing system
 *
 * @returns the `tournament` namespace key
 */
function pairingLabelKey(system: PairingSystem): string {
    switch (system) {
        case "Swiss":
            return "label.pairing-swiss";
        case "Manual":
            return "label.pairing-manual";
    }
}

/**
 * Whether a tournament can still be called off
 *
 * `Cancelled` is the one branch off the lifecycle's straight line, and the only status change this
 * tab still makes — moving an event *forward* is `TournamentNextStep`'s button on the tournament
 * screen, where an organizer is actually working when they decide to start.
 *
 * @param status the tournament's current status
 *
 * @returns whether the cancel button belongs on the page
 */
function mayCancel(status: TournamentStatus): boolean {
    return status === "Registration" || status === "Running";
}

/**
 * The organizer-only settings tab: the editable form, the status and visibility controls, and the
 * join-code card.
 *
 * @returns the page, or an empty state for a viewer with no staff role
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    // Non-null: see the same assertion in `overview.tsx` — this tab never mounts on a `null`.
    const { tournament, viewer, participant_count } = useLoaderData({
        from: "/_menu/tournaments/$tournamentUuid/_tournament",
    })!;
    const [t] = useTranslation("tournament");
    const router = useRouter();

    const [editing, setEditing] = useState(false);
    const [confirmingCancel, setConfirmingCancel] = useState(false);
    const [sharing, setSharing] = useState(false);

    if (!viewer.is_organizer) {
        return <EmptyState title={t("heading.settings")} description={t("description.organizer-only")} />;
    }

    /**
     * Moves the tournament to a new lifecycle status
     *
     * @param status the status to move to
     */
    async function setStatus(status: TournamentStatus) {
        await Api.tournaments.setStatus(tournamentUuid, status);
        notify.success(t("toast.tournament-updated"));
        await router.invalidate();
    }

    /**
     * Switches who may see the tournament
     *
     * @param visibility the visibility to switch to
     */
    async function setVisibility(visibility: Visibility) {
        await Api.tournaments.setVisibility(tournamentUuid, visibility);
        notify.success(t("toast.tournament-updated"));
        await router.invalidate();
    }

    return (
        <div className={"flex flex-col gap-8"}>
            <div className={"flex items-start justify-between gap-4"}>
                <DescriptionList className={"flex-1"}>
                    <DescriptionTerm>{t("label.format")}</DescriptionTerm>
                    <DescriptionDetails>{tournament.format}</DescriptionDetails>

                    <DescriptionTerm>{t("label.pod-size")}</DescriptionTerm>
                    <DescriptionDetails>{tournament.pod_size}</DescriptionDetails>

                    <DescriptionTerm>{t("label.games-per-match")}</DescriptionTerm>
                    <DescriptionDetails>{tournament.games_per_match}</DescriptionDetails>

                    <DescriptionTerm>{t("label.pairing-system")}</DescriptionTerm>
                    <DescriptionDetails>{t(pairingLabelKey(tournament.pairing_system))}</DescriptionDetails>

                    <DescriptionTerm>{t("label.scoring")}</DescriptionTerm>
                    <DescriptionDetails>
                        {t("label.points-summary", {
                            win: tournament.points_win,
                            draw: tournament.points_draw,
                            loss: tournament.points_loss,
                            bye: tournament.points_bye,
                        })}
                    </DescriptionDetails>

                    <DescriptionTerm>{t("label.round-minutes")}</DescriptionTerm>
                    <DescriptionDetails>{tournament.round_minutes}</DescriptionDetails>
                </DescriptionList>
                <Button outline={true} onClick={() => setEditing(true)}>
                    <PencilSquareIcon />
                    {t("button.edit")}
                </Button>
            </div>

            {tournament.status === "Running" && <Text className={"text-sm"}>{t("description.settings-locked")}</Text>}

            <div className={"flex flex-col gap-3"}>
                <Text className={"text-sm font-semibold text-zinc-950 dark:text-white"}>{t("label.status")}</Text>
                <div className={"flex flex-wrap items-center gap-3"}>
                    <Badge color={tournamentStatusColor(tournament.status)}>
                        {t(tournamentStatusLabelKey(tournament.status))}
                    </Badge>
                    {mayCancel(tournament.status) && viewer.may_manage && (
                        <Button outline={true} onClick={() => setConfirmingCancel(true)}>
                            <NoSymbolIcon />
                            {t("button.cancel-tournament")}
                        </Button>
                    )}
                </div>
            </div>

            <div className={"flex flex-col gap-3"}>
                <Text className={"text-sm font-semibold text-zinc-950 dark:text-white"}>{t("label.visibility")}</Text>
                <div className={"flex flex-wrap items-center gap-3"}>
                    <Listbox
                        className={"max-w-64"}
                        value={tournament.visibility}
                        onChange={(visibility) => void setVisibility(visibility)}
                    >
                        <ListboxOption value={Visibility.Private}>
                            <LockClosedIcon />
                            <ListboxLabel>{t("label.visibility-private")}</ListboxLabel>
                            <ListboxDescription>{t("description.visibility-private")}</ListboxDescription>
                        </ListboxOption>
                        <ListboxOption value={Visibility.Unlisted}>
                            <LinkIcon />
                            <ListboxLabel>{t("label.visibility-unlisted")}</ListboxLabel>
                            <ListboxDescription>{t("description.visibility-unlisted")}</ListboxDescription>
                        </ListboxOption>
                        <ListboxOption value={Visibility.Public}>
                            <GlobeAltIcon />
                            <ListboxLabel>{t("label.visibility-public")}</ListboxLabel>
                            <ListboxDescription>{t("description.visibility-public")}</ListboxDescription>
                        </ListboxOption>
                    </Listbox>
                    {viewer.may_manage && (
                        <Button outline={true} onClick={() => setSharing(true)}>
                            <LinkIcon />
                            {t("button.share-link")}
                        </Button>
                    )}
                </div>
            </div>

            <ShareDialog
                target={sharing ? tournamentShareTarget(tournament) : null}
                description={t("description.share-link")}
                onClose={() => setSharing(false)}
                onChanged={() => router.invalidate()}
            />

            <TournamentDialog
                open={editing}
                tournament={tournament}
                participantCount={participant_count}
                onClose={() => setEditing(false)}
                onSaved={() => {
                    setEditing(false);
                    notify.success(t("toast.tournament-updated"));
                    void router.invalidate();
                }}
            />

            <ConfirmDialog
                open={confirmingCancel}
                onClose={() => setConfirmingCancel(false)}
                onConfirm={async () => {
                    setConfirmingCancel(false);
                    await setStatus("Cancelled");
                }}
                title={t("heading.cancel-tournament")}
                description={t("description.confirm-cancel-tournament")}
                confirmLabel={t("button.cancel-tournament")}
            />
        </div>
    );
}
