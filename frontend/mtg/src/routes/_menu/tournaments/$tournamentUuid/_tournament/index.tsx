import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import type {
    MatchTableResponse,
    MyMatchResponse,
    RoundResponse,
    TournamentParticipantResponse,
} from "src/api/generated";
import { Text } from "components";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { TournamentDropButton } from "src/components/tournament-drop-button";
import { TournamentMyMatch } from "src/components/tournament-my-match";
import { TournamentRoundPanel } from "src/components/tournament-round-panel";
import { TournamentSetup } from "src/components/tournament-setup";
import { PULSE_INTERVALS, useTournamentPulse } from "src/utils/use-tournament-pulse";

/** What the address may say about this tab */
type RoundSearch = {
    /** Which round to show, by its sequence; absent means the current one */
    round?: number;
};

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/")({
    // A search param, so the bare address always means the current round; a sequence, because
    // draft and deckbuilding have no number.
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
            // The layout already proved access; a failure here shows an empty roster.
            if (!(error instanceof ResponseError)) throw error;
        }
        const rounds = (await Api.tournaments.rounds.list(params.tournamentUuid)).rounds;
        const shown: RoundResponse | undefined =
            deps.round === undefined ? rounds.at(-1) : rounds.find((round) => round.sequence === deps.round);
        const tables: Array<MatchTableResponse> =
            shown === undefined ? [] : (await Api.tournaments.rounds.tables(params.tournamentUuid, shown.uuid)).tables;
        let mine: MyMatchResponse | null = null;
        if (shown !== undefined && shown.uuid === rounds.at(-1)?.uuid) {
            try {
                mine = await Api.tournaments.rounds.myMatch(params.tournamentUuid);
            } catch (error) {
                if (!(error instanceof ResponseError)) throw error;
            }
        }
        return { participants, rounds, shown: shown ?? null, tables, mine };
    },
    component: RouteComponent,
});

/**
 * The tournament's main tab: the setup before it starts, the round (and the viewer's own table) after
 *
 * @returns the page
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const { participants, rounds, shown, tables, mine } = Route.useLoaderData();
    // Non-null: the layout renders its outlet only once it resolved a tournament.
    const { tournament, viewer, participant_count, skewMs } = useLoaderData({
        from: "/_menu/tournaments/$tournamentUuid/_tournament",
    })!;
    const [t] = useTranslation("tournament");
    const router = useRouter();
    const refresh = () => router.invalidate();

    const running = tournament.status === "Running";
    const latest = shown !== null && shown.uuid === rounds.at(-1)?.uuid;
    const editing = useRef(false);
    useTournamentPulse({
        interval: viewer.is_organizer ? PULSE_INTERVALS.staff : PULSE_INTERVALS.player,
        enabled: running && latest,
        busy: () => editing.current,
    });
    const playing = mine?.table != null && running;
    const own = participants.find((participant) => participant.uuid === viewer.participant);
    const dropped = own?.status === "Dropped" || own?.status === "Disqualified";

    if (!running && tournament.status !== "Finished") {
        return (
            <TournamentSetup
                tournamentUuid={tournamentUuid}
                tournament={tournament}
                viewer={viewer}
                participantCount={participant_count}
                participants={participants}
                onChanged={refresh}
            />
        );
    }

    return (
        <div className={"flex flex-col gap-4"}>
            {/* A drop keeps the seat they already had, but no pairing is coming for them. */}
            {mine !== null && running && !(dropped && mine.table == null) && (
                <TournamentMyMatch
                    tournamentUuid={tournamentUuid}
                    tournament={tournament}
                    match={mine}
                    skewMs={skewMs}
                    showClock={!viewer.is_organizer}
                    onChanged={refresh}
                />
            )}
            <TournamentRoundPanel
                tournamentUuid={tournamentUuid}
                tournament={tournament}
                viewer={viewer}
                rounds={rounds}
                round={shown}
                tables={tables}
                skewMs={skewMs}
                participants={participants}
                collapseTables={playing && !viewer.is_organizer}
                onEditingChange={(next) => {
                    editing.current = next;
                }}
                onChanged={refresh}
            />
            {running && own !== undefined && !viewer.is_organizer && (
                <div className={"flex justify-end"}>
                    {dropped ? (
                        <Text>{t("label.you-dropped")}</Text>
                    ) : (
                        <TournamentDropButton
                            tournamentUuid={tournamentUuid}
                            participant={own.uuid}
                            started={true}
                            onChanged={refresh}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
