import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import type { TournamentParticipantResponse } from "src/api/generated";
import { TournamentSetup } from "src/components/tournament-setup";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/")({
    loader: async ({ params }) => {
        try {
            return await Api.tournaments.participants.list(params.tournamentUuid);
        } catch (error) {
            // The layout above already proved the viewer may see this tournament; a failure here
            // is a very short-lived race at worst, and simply shows a roster of nobody.
            if (error instanceof ResponseError) return { participants: [] as Array<TournamentParticipantResponse> };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The screen a tournament is on right now: how to join it, and who has signed up.
 *
 * The join bar, the slot count and the roster used to be two tabs a desk had to flip between.
 * They are one screen, because an organizer checking somebody in is looking at the code and the
 * roster at the same moment.
 *
 * @returns the page
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const { participants } = Route.useLoaderData();
    // Non-null: the layout only ever renders `<Outlet />` — reaching this tab at all — once its
    // own loader resolved a tournament; a `null` there renders the layout's own empty state
    // instead, and this component never mounts.
    const { tournament, viewer, participant_count } = useLoaderData({
        from: "/_menu/tournaments/$tournamentUuid/_tournament",
    })!;
    const router = useRouter();

    return (
        <TournamentSetup
            tournamentUuid={tournamentUuid}
            tournament={tournament}
            viewer={viewer}
            participantCount={participant_count}
            participants={participants}
            onChanged={() => router.invalidate()}
        />
    );
}
