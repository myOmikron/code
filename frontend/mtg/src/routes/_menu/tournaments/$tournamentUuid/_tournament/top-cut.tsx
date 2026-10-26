import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentBracket } from "src/components/tournament-bracket";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/top-cut")({
    component: RouteComponent,
});

/**
 * The Top cut of a Tournament as a bracket.
 *
 * @returns the bracket
 */
function RouteComponent() {
    const { tournament } = frame.useLoaderData();
    const uuid = tournament?.uuid ?? null;
    const load = useCallback(() => Api.tournaments.rounds.list(uuid ?? ""), [uuid]);
    if (tournament === null) return null;
    return <TournamentBracket load={load} />;
}
