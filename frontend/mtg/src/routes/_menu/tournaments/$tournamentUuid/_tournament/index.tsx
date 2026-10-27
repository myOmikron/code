import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Button, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MyTournamentDeck } from "src/components/tournament-decks";
import { TournamentDetails } from "src/components/tournament-details";
import { TournamentPushActivation } from "src/components/tournament-push-activation";
import { TournamentMyMatch } from "src/components/tournament-my-match";

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
    const { tournament, me, checkedIn } = frame.useLoaderData();
    const [t] = useTranslation("tournament");
    const [organizing, setOrganizing] = useState(false);
    if (tournament === null) return null;
    return (
        <div className={"flex flex-col gap-8"}>
            {me !== null && tournament.organizer_role != null && (
                <Button outline onClick={() => setOrganizing(!organizing)} aria-pressed={organizing}>
                    {t(organizing ? "button.show-participant-view" : "button.show-organizer-view")}
                </Button>
            )}
            {me !== null && !organizing && <TournamentMyMatch key={tournament.uuid} tournament={tournament} />}
            {me !== null && !organizing && <MyTournamentDeck tournament={tournament} checkedIn={checkedIn} />}
            {me !== null && !organizing && <TournamentPushActivation />}
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
