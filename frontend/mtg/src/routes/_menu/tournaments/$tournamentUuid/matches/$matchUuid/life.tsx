import { createFileRoute, useRouter } from "@tanstack/react-router";
import { loadRecoverableMatch } from "src/utils/offline-match-context";
import { TournamentMatchLife } from "src/components/tournament-match-life";
import { TournamentLiveProvider } from "src/context/tournament-live-context";
import i18n from "src/i18n";
import { tournamentEventsUrl } from "src/utils/tournament-live";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/matches/$matchUuid/life")({
    validateSearch: (search: Record<string, unknown>): { organizer?: boolean } => ({
        organizer: search.organizer === true || search.organizer === "true",
    }),
    loader: async ({ params }) => {
        await i18n.loadNamespaces(["tournament", "game-utils"]);
        return loadRecoverableMatch(params.tournamentUuid, params.matchUuid);
    },
    component: RouteComponent,
});

function RouteComponent() {
    const { tournament, play, skewMs, offline } = Route.useLoaderData();
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
                initialSkewMs={skewMs}
                offline={offline}
                organizerView={organizer ?? false}
            />
        </TournamentLiveProvider>
    );
}
