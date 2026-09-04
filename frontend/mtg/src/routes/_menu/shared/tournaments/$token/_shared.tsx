import { Outlet, createFileRoute } from "@tanstack/react-router";
import { LinkSlashIcon } from "@heroicons/react/20/solid";
import { Badge, EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import i18n from "src/i18n";
import { isDeadShareLink } from "src/utils/share-link";

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces("tournament");
        try {
            const [tournament] = await Promise.all([Api.shared.tournaments.get(params.token), strings]);
            return { tournament };
        } catch (error) {
            if (isDeadShareLink(error)) {
                await strings;
                return { tournament: null };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The chrome around a tournament somebody shared: its name, status, format and venue, and the
 * tabs — a players tab only where the event's roster view allows one at all.
 *
 * Read-only by construction, like the rest of this section: no join code, no decklists, no
 * organizer usernames and no actions anywhere under this layout. See `SharedTournamentResponse`'s
 * own doc comment for why it is a type of its own rather than a redacted `TournamentResponse`.
 *
 * @returns the tabbed frame around the current tab, or the dead-link empty state
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { tournament } = Route.useLoaderData();
    const [t] = useTranslation("tournament");

    if (tournament === null) {
        return (
            <EmptyState
                icon={<LinkSlashIcon />}
                title={t("heading.share-link-dead")}
                description={t("description.share-link-dead")}
            />
        );
    }

    return (
        <div className={"flex flex-col gap-2"}>
            <TabLayout
                heading={tournament.name}
                headingDescription={
                    <span className={"flex flex-wrap items-center gap-2"}>
                        <Badge color={tournamentStatusColor(tournament.status)}>
                            {t(tournamentStatusLabelKey(tournament.status))}
                        </Badge>
                        <span>{tournament.format}</span>
                        {tournament.venue != null && tournament.venue !== "" && <span>{tournament.venue}</span>}
                    </span>
                }
                tabs={
                    <TabMenu>
                        <Tab href={"/shared/tournaments/$token"} params={{ token }}>
                            {t("heading.overview")}
                        </Tab>
                        {/* Hidden rather than disabled, same call as the authed layout's settings
                            tab: a stranger the roster is closed to has no use for a tab whose page
                            immediately tells them nothing is there. Direct navigation still
                            reaches it — `players.tsx` answers exactly the same either way, dead
                            token or closed roster, see its own doc comment. */}
                        {tournament.roster_available && (
                            <Tab href={"/shared/tournaments/$token/players"} params={{ token }}>
                                {t("heading.players")}
                            </Tab>
                        )}
                    </TabMenu>
                }
            >
                <Outlet />
            </TabLayout>
        </div>
    );
}
