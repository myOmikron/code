import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { Text } from "components";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import type { SharedParticipantResponse } from "src/api/generated";
import { TournamentRosterList } from "src/components/tournament-roster";
import { TournamentSlots } from "src/components/tournament-slots";
import { TournamentVenue } from "src/components/tournament-venue";

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/")({
    loader: async ({ params }) => {
        try {
            return await Api.shared.tournaments.participants(params.token);
        } catch (error) {
            // A hidden roster answers like a dead token; show it as empty.
            if (error instanceof ResponseError) return { participants: [] as Array<SharedParticipantResponse> };
            throw error;
        }
    },
    component: RouteComponent,
});

/** The card surface the page's blocks sit on */
const CARD =
    "rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10";

/**
 * A shared tournament: how full it is, venue, and the roster where the event allows it
 *
 * @returns the page
 */
function RouteComponent() {
    // Non-null: the layout only renders `<Outlet />` for a resolved tournament.
    const tournament = useLoaderData({ from: "/_menu/shared/tournaments/$token/_shared" }).tournament!;
    const { participants } = Route.useLoaderData();

    return (
        <div className={"flex flex-col gap-5"}>
            <TournamentSlots count={tournament.participant_count} max={tournament.max_participants} className={CARD} />

            {tournament.description != null && tournament.description !== "" && <Text>{tournament.description}</Text>}

            {tournament.venue != null && tournament.venue !== "" && (
                <div className={CARD}>
                    <TournamentVenue
                        name={tournament.venue}
                        address={tournament.venue_address}
                        instructions={tournament.venue_instructions}
                    />
                </div>
            )}

            {tournament.roster_available && (
                <TournamentRosterList names={participants.map((participant) => participant.display_name)} />
            )}
        </div>
    );
}
