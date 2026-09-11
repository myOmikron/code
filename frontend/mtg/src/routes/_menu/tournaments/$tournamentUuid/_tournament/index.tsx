import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import type { TournamentParticipantResponse } from "src/api/generated";
import { TournamentRoundPanel } from "src/components/tournament-round-panel";
import { TournamentSetup } from "src/components/tournament-setup";
import { PULSE_INTERVALS, useTournamentPulse } from "src/utils/use-tournament-pulse";

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
 * The screen a tournament is on right now.
 *
 * Before it starts that is how to join it and who has signed up; once it starts the same tab
 * becomes the round, because the round is the only thing anybody at the desk is looking at. The
 * roster does not disappear — it moves to a tab of its own, where it is still reachable for a late
 * arrival or a drop.
 *
 * @returns the page
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const { participants } = Route.useLoaderData();
    // Non-null: the layout only ever renders `<Outlet />` — reaching this tab at all — once its
    // own loader resolved a tournament; a `null` there renders the layout's own empty state
    // instead, and this component never mounts.
    const { tournament, viewer, participant_count, rounds, tables, skewMs } = useLoaderData({
        from: "/_menu/tournaments/$tournamentUuid/_tournament",
    })!;
    const router = useRouter();

    const running = tournament.status === "Running";
    useTournamentPulse({
        interval: viewer.is_organizer ? PULSE_INTERVALS.staff : PULSE_INTERVALS.player,
        enabled: running,
    });

    if (!running && tournament.status !== "Finished") {
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

    return (
        <TournamentRoundPanel
            tournamentUuid={tournamentUuid}
            tournament={tournament}
            viewer={viewer}
            rounds={rounds}
            tables={tables}
            skewMs={skewMs}
            onChanged={() => router.invalidate()}
        />
    );
}
