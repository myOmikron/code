import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { EyeSlashIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "components";
import { useTranslation } from "react-i18next";
import { TournamentOrganizers } from "src/components/tournament-organizers";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/organizers")({
    component: RouteComponent,
});

/**
 * Who runs a Tournament and how it is handed on, for its Organizers.
 *
 * @returns the Organizers, or a notice for anybody else
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { tournament } = frame.useLoaderData();
    if (tournament === null) return null;
    const role = tournament.organizer_role ?? null;
    if (role === null) {
        return (
            <EmptyState
                icon={<EyeSlashIcon />}
                title={t("heading.organizers-only")}
                description={t("description.organizers-only")}
            />
        );
    }
    return <TournamentOrganizers tournament={tournament} role={role} />;
}
