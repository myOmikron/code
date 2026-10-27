import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { TournamentDetails } from "src/components/tournament-details";
import { TournamentGuestSeat } from "src/components/tournament-guest-seat";
import { TournamentGuestSignUp } from "src/components/tournament-guest-sign-up";
import { TournamentMyMatch } from "src/components/tournament-my-match";
import { useAccount } from "src/context/account";
import { guestSignUpOpen } from "src/utils/tournament-guest";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/shared/tournaments/$token/_shared");

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/")({
    component: RouteComponent,
});

/**
 * What a shared Tournament is: when and where, and how it is played. A visitor
 * without an Account signs up as a Guest here where the Owner allows it, and
 * then sees its own Match.
 *
 * @returns the details
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { tournament, me, asGuest, checkedIn, dropped } = frame.useLoaderData();
    const { account } = useAccount();
    const router = useRouter();
    if (tournament === null) return null;
    return (
        <div className={"flex flex-col gap-8"}>
            {me === null && account === null && guestSignUpOpen(tournament) && (
                <TournamentGuestSignUp
                    tournament={tournament}
                    signUp={(request) => Api.shared.tournaments.guestSignUp(token, request)}
                    onSignedUp={() => void router.invalidate()}
                />
            )}
            {me !== null && asGuest && (
                <TournamentGuestSeat
                    tournament={tournament}
                    checkedIn={checkedIn}
                    dropped={dropped}
                    onLeft={() => void router.invalidate()}
                />
            )}
            {me !== null && <TournamentMyMatch key={tournament.uuid} tournament={tournament} guest={asGuest} />}
            <TournamentDetails tournament={tournament} />
        </div>
    );
}
