import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentStandings } from "src/components/tournament-standings";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/standings")({
    component: RouteComponent,
});

/**
 * The standings of a Tournament.
 *
 * @returns the standings
 */
function RouteComponent() {
    const { tournament } = frame.useLoaderData();
    const uuid = tournament?.uuid ?? null;
    const load = useCallback(() => Api.tournaments.rounds.standings(uuid ?? ""), [uuid]);
    if (tournament === null) return null;
    return <TournamentStandings load={load} />;
}
