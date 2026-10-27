import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { EmptyState, notify } from "components";
import { EyeSlashIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { TournamentForm } from "src/components/tournament-form";
import i18n from "src/i18n";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/edit")({
    loader: async ({ params }) => {
        const [tournament, offered] = await Promise.all([
            Api.tournaments.get(params.tournamentUuid),
            Api.decks.formats(),
            i18n.loadNamespaces(["tournament", "deck"]),
        ]);
        return { tournament, formats: offered.formats };
    },
    component: RouteComponent,
});

/** The dedicated settings page, available to the Tournament's Organizers. */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { tournament, formats } = Route.useLoaderData();
    const navigate = useNavigate();
    const router = useRouter();
    const back = () =>
        void navigate({ to: "/tournaments/$tournamentUuid", params: { tournamentUuid: tournament.uuid } });
    if (tournament.organizer_role == null)
        return (
            <EmptyState
                icon={<EyeSlashIcon />}
                title={t("heading.not-visible")}
                description={t("description.not-visible")}
            />
        );
    return (
        <TournamentForm
            key={tournament.uuid}
            tournament={tournament}
            formats={formats}
            onClose={back}
            onSaved={async () => {
                notify.success(t("toast.tournament-saved"));
                await router.invalidate();
                back();
            }}
        />
    );
}
