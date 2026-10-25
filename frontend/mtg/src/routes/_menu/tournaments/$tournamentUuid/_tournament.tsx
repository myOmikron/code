import { Outlet, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { NoSymbolIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/20/solid";
import { EyeSlashIcon } from "@heroicons/react/24/outline";
import { Badge, Button, ConfirmDialog, EmptyState, Tab, TabLayout, TabMenu, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { OrganizerRole, TournamentState } from "src/api/generated";
import { TournamentDialog } from "src/components/tournament-dialog";
import { useTournamentLabels } from "src/components/tournament-labels";
import i18n from "src/i18n";
import { isNotPublic } from "src/utils/public-page";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces(["tournament", "deck"]);
        try {
            const [tournament, offered] = await Promise.all([
                Api.tournaments.get(params.tournamentUuid),
                Api.decks.formats(),
                strings,
            ]);
            return { tournament, formats: offered.formats };
        } catch (error) {
            if (isNotPublic(error)) {
                await strings;
                return { tournament: null, formats: [] };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The frame around one Tournament: its name, who runs it, the tabs, and the
 * Organizers' actions.
 *
 * Organizers edit the settings and see who runs it; only the Owner deletes it.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { tournamentUuid } = Route.useParams();
    const { tournament, formats } = Route.useLoaderData();
    const labels = useTournamentLabels();
    const router = useRouter();
    const navigate = useNavigate();
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    if (tournament === null) {
        return (
            <EmptyState
                icon={<EyeSlashIcon />}
                title={t("heading.not-visible")}
                description={t("description.not-visible")}
            />
        );
    }

    const role = tournament.organizer_role ?? null;
    const over = tournament.state === TournamentState.Finished || tournament.state === TournamentState.Cancelled;

    /**
     * Cancels the Tournament after the confirmation was accepted
     */
    async function cancel() {
        await Api.tournaments.cancel(tournamentUuid);
        setCancelling(false);
        notify.success(t("toast.tournament-cancelled"));
        await router.invalidate();
    }

    /**
     * Deletes the Tournament after the confirmation was accepted
     */
    async function remove() {
        await Api.tournaments.delete(tournamentUuid);
        setDeleting(false);
        notify.success(t("toast.tournament-deleted"));
        await navigate({ to: "/tournaments/mine" });
    }

    return (
        <TabLayout
            heading={tournament.name}
            headingDescription={
                <span className={"flex flex-wrap items-center gap-2"}>
                    <Badge color={"sky"}>{labels.state(tournament.state)}</Badge>
                    <span>{labels.organizedBy(tournament.owner)}</span>
                </span>
            }
            headingChildren={
                role !== null && (
                    <>
                        <Button outline onClick={() => setEditing(true)}>
                            <PencilSquareIcon />
                            {t("button.edit-tournament")}
                        </Button>
                        {!over && (
                            <Button outline onClick={() => setCancelling(true)}>
                                <NoSymbolIcon />
                                {t("button.cancel-tournament")}
                            </Button>
                        )}
                        {role === OrganizerRole.Owner && (
                            <Button outline onClick={() => setDeleting(true)}>
                                <TrashIcon />
                                {t("button.delete-tournament")}
                            </Button>
                        )}
                    </>
                )
            }
            tabs={
                <TabMenu>
                    <Tab
                        href={"/tournaments/$tournamentUuid"}
                        params={{ tournamentUuid }}
                        activeOptions={{ exact: true }}
                    >
                        {t("heading.overview")}
                    </Tab>
                    <Tab href={"/tournaments/$tournamentUuid/participants"} params={{ tournamentUuid }}>
                        {t("heading.participants")}
                    </Tab>
                    <Tab href={"/tournaments/$tournamentUuid/rounds"} params={{ tournamentUuid }}>
                        {t("heading.rounds")}
                    </Tab>
                    <Tab href={"/tournaments/$tournamentUuid/standings"} params={{ tournamentUuid }}>
                        {t("heading.standings")}
                    </Tab>
                    {role !== null && (
                        <Tab href={"/tournaments/$tournamentUuid/organizers"} params={{ tournamentUuid }}>
                            {t("heading.organizers")}
                        </Tab>
                    )}
                </TabMenu>
            }
        >
            <Outlet />

            {role !== null && (
                <TournamentDialog
                    open={editing}
                    tournament={tournament}
                    formats={formats}
                    onClose={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        notify.success(t("toast.tournament-saved"));
                        void router.invalidate();
                    }}
                />
            )}

            <ConfirmDialog
                open={cancelling}
                onClose={() => setCancelling(false)}
                onConfirm={cancel}
                title={t("heading.cancel-tournament")}
                description={t("description.cancel-tournament", { name: tournament.name })}
                confirmLabel={t("button.cancel-tournament")}
            />

            <ConfirmDialog
                open={deleting}
                onClose={() => setDeleting(false)}
                onConfirm={remove}
                title={t("heading.delete-tournament")}
                description={t("description.delete-tournament", { name: tournament.name })}
                confirmLabel={t("button.delete-tournament")}
            />
        </TabLayout>
    );
}
