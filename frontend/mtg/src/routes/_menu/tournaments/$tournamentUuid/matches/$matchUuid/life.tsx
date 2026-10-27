import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { TournamentMatchLife } from "src/components/tournament-match-life";
import { TournamentLiveProvider } from "src/context/tournament-live-context";
import i18n from "src/i18n";
import { tournamentEventsUrl } from "src/utils/tournament-live";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/matches/$matchUuid/life")({
    validateSearch: (search: Record<string, unknown>): { organizer?: boolean } => ({
        organizer: search.organizer === true || search.organizer === "true",
    }),
    loader: async ({ params }) => {
        const [tournament, play] = await Promise.all([
            Api.tournaments.get(params.tournamentUuid),
            Api.tournaments.rounds.play(params.tournamentUuid, params.matchUuid),
            i18n.loadNamespaces(["tournament", "game-utils"]),
        ]);
        return { tournament, play };
    },
    component: RouteComponent,
});

function RouteComponent() {
    const { tournament, play } = Route.useLoaderData();
    const { organizer } = Route.useSearch();
    const router = useRouter();
    return (
        <TournamentLiveProvider
            url={tournamentEventsUrl(tournament.uuid)}
            onTournamentChanged={() => {
                void router.invalidate();
            }}
        >
            <TournamentMatchLife
                key={play.round.matches[0].uuid}
                tournament={tournament}
                initialPlay={play}
                organizerView={organizer ?? false}
            />
        </TournamentLiveProvider>
    );
}
