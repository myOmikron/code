import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { Api } from "src/api/api";
import { TournamentBracket } from "src/components/tournament-bracket";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/shared/tournaments/$token/_shared");

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/top-cut")({
    component: RouteComponent,
});

/**
 * The Top cut of a shared Tournament as a bracket.
 *
 * @returns the bracket
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { tournament } = frame.useLoaderData();
    const load = useCallback(() => Api.shared.tournaments.rounds(token), [token]);
    if (tournament === null) return null;
    return <TournamentBracket load={load} topCut={tournament.top_cut ?? null} />;
}
