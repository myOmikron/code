import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentRounds } from "src/components/tournament-rounds";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/rounds")({
    component: RouteComponent,
});

/**
 * The Rounds of a Tournament, and for its Organizers running them.
 *
 * @returns the Rounds
 */
function RouteComponent() {
    const { tournament } = frame.useLoaderData();
    const router = useRouter();
    const uuid = tournament?.uuid ?? null;
    const load = useCallback(() => Api.tournaments.rounds.list(uuid ?? ""), [uuid]);
    if (tournament === null) return null;
    return (
        <TournamentRounds tournament={tournament} load={load} onTournamentChanged={() => void router.invalidate()} />
    );
}
