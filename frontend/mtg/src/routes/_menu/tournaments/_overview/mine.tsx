import { createFileRoute } from "@tanstack/react-router";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RequireAccount } from "src/components/require-account";
import { TournamentList } from "src/components/tournament-list";

export const Route = createFileRoute("/_menu/tournaments/_overview/mine")({
    loader: () => Api.tournaments.mine(),
    component: RouteComponent,
});

/**
 * The Tournaments the reader owns, latest start first.
 *
 * @returns the list
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { tournaments } = Route.useLoaderData();

    return (
        <RequireAccount>
            {tournaments.length === 0 ? (
                <EmptyState
                    icon={<TrophyIcon />}
                    title={t("heading.no-my-tournaments")}
                    description={t("description.no-my-tournaments")}
                />
            ) : (
                <TournamentList tournaments={tournaments} showOwner={false} />
            )}
        </RequireAccount>
    );
}
