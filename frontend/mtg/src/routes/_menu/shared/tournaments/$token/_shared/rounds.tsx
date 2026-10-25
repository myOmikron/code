import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentRounds } from "src/components/tournament-rounds";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/shared/tournaments/$token/_shared");

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/rounds")({
    component: RouteComponent,
});

/**
 * The Rounds of a shared Tournament, as anybody with the link sees them.
 *
 * @returns the Rounds
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { tournament } = frame.useLoaderData();
    const load = useCallback(() => Api.shared.tournaments.rounds(token), [token]);
    if (tournament === null) return null;
    return <TournamentRounds tournament={tournament} load={load} />;
}
