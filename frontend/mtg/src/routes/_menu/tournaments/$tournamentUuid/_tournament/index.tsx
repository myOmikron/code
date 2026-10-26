import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { TournamentState } from "src/api/generated";
import { TournamentDetails } from "src/components/tournament-details";
import { TournamentMyMatch } from "src/components/tournament-my-match";
import { useAccount } from "src/context/account";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/")({
    component: RouteComponent,
});

/**
 * What a Tournament is: when and where, and how it is played; while a Round
 * runs, the reader's own Match and the round timer on top.
 *
 * @returns the details
 */
function RouteComponent() {
    const { tournament } = frame.useLoaderData();
    const { account } = useAccount();
    if (tournament === null) return null;
    const playing = tournament.state === TournamentState.Swiss || tournament.state === TournamentState.TopCut;
    return (
        <div className={"flex flex-col gap-8"}>
            {account !== null && playing && <TournamentMyMatch key={tournament.uuid} tournament={tournament} />}
            <TournamentDetails tournament={tournament} />
        </div>
    );
}
