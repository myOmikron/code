import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import type { TournamentParticipantResponse } from "src/api/generated";
import { TournamentJoinBar } from "src/components/tournament-join-code";
import { TournamentRoster, TournamentRosterList } from "src/components/tournament-roster";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/players")({
    loader: async ({ params }) => {
        try {
            return await Api.tournaments.participants.list(params.tournamentUuid);
        } catch (error) {
            if (error instanceof ResponseError) return { participants: [] as Array<TournamentParticipantResponse> };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The roster, once the event is under way.
 *
 * It keeps the join bar rather than leaving it behind on the setup screen: somebody always turns
 * up after the first round has been paired, and the desk needs the code and the add-player button
 * in the same place to seat them.
 *
 * @returns the page
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const { participants } = Route.useLoaderData();
    // Non-null for the same reason the sibling index route gives.
    const { tournament, viewer, participant_count } = useLoaderData({
        from: "/_menu/tournaments/$tournamentUuid/_tournament",
    })!;
    const router = useRouter();

    return (
        <div className={"flex flex-col gap-5"}>
            {viewer.is_organizer && (
                <TournamentJoinBar
                    tournamentUuid={tournamentUuid}
                    joinCode={tournament.join_code}
                    participantCount={participant_count}
                    maxParticipants={tournament.max_participants}
                    mayManage={viewer.may_manage}
                    onChanged={() => router.invalidate()}
                />
            )}

            {viewer.is_organizer ? (
                <TournamentRoster
                    tournamentUuid={tournamentUuid}
                    tournament={tournament}
                    viewer={viewer}
                    participants={participants}
                    onChanged={() => router.invalidate()}
                />
            ) : (
                <TournamentRosterList names={participants.map((participant) => participant.display_name)} />
            )}
        </div>
    );
}
