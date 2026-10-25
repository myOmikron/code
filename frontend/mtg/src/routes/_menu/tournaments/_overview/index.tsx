import { createFileRoute } from "@tanstack/react-router";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { TournamentList } from "src/components/tournament-list";

export const Route = createFileRoute("/_menu/tournaments/_overview/")({
    loader: () => Api.tournaments.listPublic(),
    component: RouteComponent,
});

/**
 * The public Tournaments, latest start first.
 *
 * @returns the list
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { tournaments } = Route.useLoaderData();

    if (tournaments.length === 0) {
        return (
            <EmptyState
                icon={<TrophyIcon />}
                title={t("heading.no-public-tournaments")}
                description={t("description.no-public-tournaments")}
            />
        );
    }
    return <TournamentList tournaments={tournaments} showOwner={true} />;
}
