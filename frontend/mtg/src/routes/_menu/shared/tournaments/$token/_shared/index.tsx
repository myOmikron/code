import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { TournamentDetails } from "src/components/tournament-details";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/shared/tournaments/$token/_shared");

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/")({
    component: RouteComponent,
});

/**
 * What a shared Tournament is: when and where, and how it is played.
 *
 * @returns the details
 */
function RouteComponent() {
    const { tournament } = frame.useLoaderData();
    if (tournament === null) return null;
    return <TournamentDetails tournament={tournament} />;
}
