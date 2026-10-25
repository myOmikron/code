import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentStandings } from "src/components/tournament-standings";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/shared/tournaments/$token/_shared");

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/standings")({
    component: RouteComponent,
});

/**
 * The standings of a shared Tournament.
 *
 * @returns the standings
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { tournament } = frame.useLoaderData();
    const load = useCallback(() => Api.shared.tournaments.standings(token), [token]);
    if (tournament === null) return null;
    return <TournamentStandings load={load} />;
}
