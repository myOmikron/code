import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import type { GuestSignUpRequest } from "src/api/generated";
import { TournamentParticipants } from "src/components/tournament-participants";
import { useLiveVersion } from "src/context/tournament-live-context";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/participants")({
    component: RouteComponent,
});

/**
 * Who plays in a Tournament, signing up for it with an Account or as a Guest,
 * and for its Organizers adding and removing Participants.
 *
 * @returns the participant list
 */
function RouteComponent() {
    const { tournament } = frame.useLoaderData();
    const uuid = tournament?.uuid ?? null;
    const version = useLiveVersion("participants");
    const load = useCallback(() => Api.tournaments.participants.list(uuid ?? ""), [uuid, version]);
    const signUp = useCallback(() => Api.tournaments.participants.signUp(uuid ?? ""), [uuid]);
    const guestSignUp = useCallback(
        (request: GuestSignUpRequest) => Api.tournaments.guests.signUp(uuid ?? "", request),
        [uuid],
    );
    if (tournament === null) return null;
    return <TournamentParticipants tournament={tournament} load={load} signUp={signUp} guestSignUp={guestSignUp} />;
}
