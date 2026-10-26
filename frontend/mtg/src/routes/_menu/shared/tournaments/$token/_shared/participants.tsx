import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentParticipants } from "src/components/tournament-participants";
import { useLiveVersion } from "src/context/tournament-live-context";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/shared/tournaments/$token/_shared");

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/participants")({
    component: RouteComponent,
});

/**
 * Who plays in a shared Tournament, and signing up for it through the link.
 *
 * @returns the participant list
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { tournament } = frame.useLoaderData();
    const version = useLiveVersion("participants");
    const load = useCallback(() => Api.shared.tournaments.participants(token), [token, version]);
    const signUp = useCallback(() => Api.shared.tournaments.signUp(token), [token]);
    if (tournament === null) return null;
    return <TournamentParticipants tournament={tournament} load={load} signUp={signUp} />;
}
