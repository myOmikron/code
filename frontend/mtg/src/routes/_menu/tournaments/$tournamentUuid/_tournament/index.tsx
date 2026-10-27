import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { Button, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { MyTournamentDeck } from "src/components/tournament-decks";
import { TournamentDetails } from "src/components/tournament-details";
import { TournamentGuestSeat } from "src/components/tournament-guest-seat";
import { TournamentGuestSignUp } from "src/components/tournament-guest-sign-up";
import { TournamentPushActivation } from "src/components/tournament-push-activation";
import { TournamentMyMatch } from "src/components/tournament-my-match";
import { TournamentSignUpQr } from "src/components/tournament-sign-up-qr";
import { useAccount } from "src/context/account";
import { guestSignUpOpen } from "src/utils/tournament-guest";

/** The frame this tab sits in, which already loaded the Tournament */
const frame = getRouteApi("/_menu/tournaments/$tournamentUuid/_tournament");

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/")({
    component: RouteComponent,
});

/**
 * What a Tournament is: when and where, and how it is played; while a Round
 * runs, the reader's own Match and the round timer on top. A visitor without
 * an Account signs up as a Guest here where the Owner allows it, and the
 * Organizers find the QR code players sign up with.
 *
 * @returns the details
 */
function RouteComponent() {
    const { tournament, me, asGuest, checkedIn, dropped } = frame.useLoaderData();
    const [t] = useTranslation("tournament");
    const { account } = useAccount();
    const router = useRouter();
    const [organizing, setOrganizing] = useState(false);
    if (tournament === null) return null;
    const playing = me !== null && !organizing;
    return (
        <div className={"flex flex-col gap-8"}>
            {me !== null && tournament.organizer_role != null && (
                <Button outline onClick={() => setOrganizing(!organizing)} aria-pressed={organizing}>
                    {t(organizing ? "button.show-participant-view" : "button.show-organizer-view")}
                </Button>
            )}
            {tournament.organizer_role != null && !playing && <TournamentSignUpQr tournament={tournament} />}
            {me === null && account === null && guestSignUpOpen(tournament) && (
                <TournamentGuestSignUp
                    tournament={tournament}
                    signUp={(request) => Api.tournaments.guests.signUp(tournament.uuid, request)}
                    onSignedUp={() => void router.invalidate()}
                />
            )}
            {playing && asGuest && (
                <TournamentGuestSeat
                    tournament={tournament}
                    checkedIn={checkedIn}
                    dropped={dropped}
                    onLeft={() => void router.invalidate()}
                />
            )}
            {playing && <TournamentMyMatch key={tournament.uuid} tournament={tournament} guest={asGuest} />}
            {playing && !asGuest && <MyTournamentDeck tournament={tournament} checkedIn={checkedIn} />}
            {playing && !asGuest && <TournamentPushActivation />}
            {organizing && (
                <div className={"flex flex-col gap-3"}>
                    <Text>{t("description.organizer-view")}</Text>
                    <Button
                        outline
                        href={"/tournaments/$tournamentUuid/rounds"}
                        params={{ tournamentUuid: tournament.uuid }}
                    >
                        {t("heading.rounds")}
                    </Button>
                    <Button
                        outline
                        href={"/tournaments/$tournamentUuid/participants"}
                        params={{ tournamentUuid: tournament.uuid }}
                    >
                        {t("heading.participants")}
                    </Button>
                </div>
            )}
            <TournamentDetails tournament={tournament} />
        </div>
    );
}
