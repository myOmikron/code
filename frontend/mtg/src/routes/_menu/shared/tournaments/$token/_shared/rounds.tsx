import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentRounds } from "src/components/tournament-rounds";
import { useLiveVersion } from "src/context/tournament-live-context";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/shared/tournaments/$token/_shared");

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/rounds")({
    component: RouteComponent,
});

/**
 * The Rounds of a shared Tournament, as anybody with the link sees them; its
 * Participants report their Results here too.
 *
 * @returns the Rounds
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { tournament, me } = frame.useLoaderData();
    const version = useLiveVersion("rounds");
    const load = useCallback(() => Api.shared.tournaments.rounds(token), [token, version]);
    if (tournament === null) return null;
    return <TournamentRounds tournament={tournament} load={load} me={me} />;
}
