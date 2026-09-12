import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { EmptyState } from "components";
import { TrophyIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { TournamentStandingsTable } from "src/components/tournament-standings-table";
import { PULSE_INTERVALS, useTournamentPulse } from "src/utils/use-tournament-pulse";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/standings")({
    loader: async ({ params }) => Api.tournaments.standings(params.tournamentUuid),
    component: RouteComponent,
});

/**
 * Where everybody stands.
 *
 * Polled more slowly than the round screen: standings move only when a table settles, and a rank
 * that reshuffles under somebody's finger is worse than one that is a few seconds old.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { standings, tiebreakers, outstanding_tables } = Route.useLoaderData();
    // Non-null for the same reason the sibling index route gives.
    const { viewer } = useLoaderData({ from: "/_menu/tournaments/$tournamentUuid/_tournament" })!;

    useTournamentPulse({ interval: PULSE_INTERVALS.standings, enabled: true });

    if (standings.length === 0) {
        return (
            <EmptyState
                icon={<TrophyIcon />}
                title={t("heading.no-standings")}
                description={t("description.no-standings")}
            />
        );
    }

    return (
        <TournamentStandingsTable
            standings={standings}
            tiebreakers={tiebreakers}
            outstandingTables={outstanding_tables}
            ownParticipant={viewer.participant}
        />
    );
}
