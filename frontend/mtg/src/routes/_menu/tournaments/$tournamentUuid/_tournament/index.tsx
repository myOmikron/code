import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import type { MatchTableResponse, RoundResponse, TournamentParticipantResponse } from "src/api/generated";
import { TournamentRoundPanel } from "src/components/tournament-round-panel";
import { TournamentSetup } from "src/components/tournament-setup";
import { PULSE_INTERVALS, useTournamentPulse } from "src/utils/use-tournament-pulse";

/** What the address may say about this tab */
type RoundSearch = {
    /** Which round to show, by its sequence; absent means the current one */
    round?: number;
};

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/")({
    // The round is a search param rather than a path segment on purpose: the address without
    // it means "the current round", and that address has to stay valid forever — it is what an
    // organizer bookmarks. A sequence rather than a round number, because a draft or
    // deckbuilding stage has no number and `/rounds/0` would be a lie.
    validateSearch: (search: Record<string, unknown>): RoundSearch => {
        const round = Number(search.round);
        return Number.isInteger(round) && round > 0 ? { round } : {};
    },
    loaderDeps: ({ search }) => ({ round: search.round }),
    loader: async ({ params, deps }) => {
        let participants: Array<TournamentParticipantResponse> = [];
        try {
            participants = (await Api.tournaments.participants.list(params.tournamentUuid)).participants;
        } catch (error) {
            // The layout above already proved the viewer may see this tournament; a failure here
            // is a very short-lived race at worst, and simply shows a roster of nobody.
            if (!(error instanceof ResponseError)) throw error;
        }
        // The list is fetched by the layout too, for its tab label. Once more here is cheaper
        // than threading it down: this loader needs it to turn a sequence into a round.
        const rounds = (await Api.tournaments.rounds.list(params.tournamentUuid)).rounds;
        const shown: RoundResponse | undefined =
            deps.round === undefined ? rounds.at(-1) : rounds.find((round) => round.sequence === deps.round);
        const tables: Array<MatchTableResponse> =
            shown === undefined ? [] : (await Api.tournaments.rounds.tables(params.tournamentUuid, shown.uuid)).tables;
        return { participants, rounds, shown: shown ?? null, tables };
    },
    component: RouteComponent,
});

/**
 * The screen a tournament is on right now.
 *
 * Before it starts that is how to join it and who has signed up; once it starts the same tab
 * becomes the round, because the round is the only thing anybody at the desk is looking at. The
 * roster does not disappear — it moves to a tab of its own, where it is still reachable for a late
 * arrival or a drop. Any earlier round is one click away on the rail, for the result that was
 * entered wrong.
 *
 * @returns the page
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const { participants, rounds, shown, tables } = Route.useLoaderData();
    // Non-null: the layout only ever renders `<Outlet />` — reaching this tab at all — once its
    // own loader resolved a tournament; a `null` there renders the layout's own empty state
    // instead, and this component never mounts.
    const { tournament, viewer, participant_count, skewMs } = useLoaderData({
        from: "/_menu/tournaments/$tournamentUuid/_tournament",
    })!;
    const router = useRouter();

    const running = tournament.status === "Running";
    const latest = shown !== null && shown.uuid === rounds.at(-1)?.uuid;
    // A round in the past does not change under anybody, so it is not polled.
    useTournamentPulse({
        interval: viewer.is_organizer ? PULSE_INTERVALS.staff : PULSE_INTERVALS.player,
        enabled: running && latest,
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
            round={shown}
            tables={tables}
            skewMs={skewMs}
            onChanged={() => router.invalidate()}
        />
    );
}
