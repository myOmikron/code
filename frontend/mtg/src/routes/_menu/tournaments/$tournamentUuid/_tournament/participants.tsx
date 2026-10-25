import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentParticipants } from "src/components/tournament-participants";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/participants")({
    component: RouteComponent,
});

/**
 * Who plays in a Tournament, signing up for it, and for its Organizers adding
 * and removing Participants.
 *
 * @returns the participant list
 */
function RouteComponent() {
    const { tournament } = frame.useLoaderData();
    const uuid = tournament?.uuid ?? null;
    const load = useCallback(() => Api.tournaments.participants.list(uuid ?? ""), [uuid]);
    const signUp = useCallback(() => Api.tournaments.participants.signUp(uuid ?? ""), [uuid]);
    if (tournament === null) return null;
    return <TournamentParticipants tournament={tournament} load={load} signUp={signUp} />;
}
