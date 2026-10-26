import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentRounds } from "src/components/tournament-rounds";
import { useLoaded } from "src/utils/use-loaded";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/rounds")({
    component: RouteComponent,
});

/**
 * The Rounds of a Tournament, for its Organizers running them and for its
 * Participants reporting their Results.
 *
 * @returns the Rounds
 */
function RouteComponent() {
    const { tournament } = frame.useLoaderData();
    const router = useRouter();
    const uuid = tournament?.uuid ?? null;
    const load = useCallback(() => Api.tournaments.rounds.list(uuid ?? ""), [uuid]);
    const participants = useLoaded(
        async () => (uuid === null ? null : Api.tournaments.participants.list(uuid)),
        [uuid],
    );
    if (tournament === null) return null;
    return (
        <TournamentRounds
            tournament={tournament}
            load={load}
            me={participants.data?.me ?? null}
            onTournamentChanged={() => void router.invalidate()}
        />
    );
}
