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
            // The layout above already resolved this token to a tournament whose roster view
            // allows a list at all (`roster_available`). A roster that turned `Hidden` between
            // the two requests answers the same way a dead token does — deliberately
            // indistinguishable, see `roster_view` — and reads here as an empty roster.
            if (error instanceof ResponseError) return { participants: [] as Array<SharedParticipantResponse> };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * A shared tournament as the room sees it: how full it is, and — where the event allows names at
 * all — who is playing.
 *
 * No check-in state anywhere. Who has turned up is the desk's working knowledge and tells a reader
 * outside it nothing; what they actually came to find out is whether there is still a seat. The
 * event's own roster view decides whether names travel this far, and a guest arrives under their
 * real name or a `Gast {n}` pseudonym accordingly — this page renders what it was handed without
 * an opinion of its own.
 *
 * @returns the page
 */
function RouteComponent() {
    // Non-null: the layout only ever renders `<Outlet />` once its own loader resolved a
    // tournament; a dead link renders the layout's own empty state instead.
    const tournament = useLoaderData({ from: "/_menu/shared/tournaments/$token/_shared" }).tournament!;
    const { participants } = Route.useLoaderData();

    return (
        <div className={"flex flex-col gap-5"}>
            <TournamentSlots
                count={tournament.participant_count}
                max={tournament.max_participants}
                className={
                    "rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                }
            />

            {tournament.description != null && tournament.description !== "" && <Text>{tournament.description}</Text>}

            {tournament.venue != null && tournament.venue !== "" && (
                <div
                    className={
                        "rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                    }
                >
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
