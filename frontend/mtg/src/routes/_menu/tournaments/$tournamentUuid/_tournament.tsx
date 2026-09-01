import { NoSymbolIcon } from "@heroicons/react/20/solid";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Badge, Button, EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import i18n from "src/i18n";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament")({
    loader: async ({ params }) => {
        await i18n.loadNamespaces("tournament");
        try {
            return await Api.tournaments.get(params.tournamentUuid);
        } catch (error) {
            // A guest whose session died, or a stranger on a private event, gets a plain 400
            // (denied) or 401 (no actor identity at all) — either way there is nothing here for
            // them, and that is not the app's error screen's business to report.
            if (error instanceof ResponseError) return null;
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The chrome around one tournament: its name, its status, and the tabs holding the roster.
 *
 * No `<RequireAccount>` here — guests are exactly who this section exists for. Identity comes
 * from the `TournamentActor` the backend resolved when answering `get_tournament`; a viewer who
 * failed that resolves to `null` above and sees the dead-link state instead of a tab at all.
 *
 * @returns the tabbed frame around the current tab, or an empty state for a tournament the viewer
 * cannot reach
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const data = Route.useLoaderData();
    const [t] = useTranslation("tournament");

    if (data === null) {
        return (
            <EmptyState
                icon={<NoSymbolIcon />}
                title={t("error.tournament-gone")}
                action={<Button href={"/tournaments"}>{t("heading.tournaments")}</Button>}
            />
        );
    }

    const { tournament, viewer } = data;

    return (
        <div className={"flex flex-col gap-2"}>
            <TabLayout
                heading={tournament.name}
                headingDescription={
                    <Badge color={tournamentStatusColor(tournament.status)}>
                        {t(tournamentStatusLabelKey(tournament.status))}
                    </Badge>
                }
                tabs={
                    <TabMenu>
                        <Tab href={"/tournaments/$tournamentUuid/overview"} params={{ tournamentUuid }}>
                            {t("heading.overview")}
                        </Tab>
                        <Tab href={"/tournaments/$tournamentUuid/players"} params={{ tournamentUuid }}>
                            {t("heading.players")}
                        </Tab>
                        {/* Hidden rather than disabled: a scorekeeper or a player has no use for
                            a tab whose page immediately tells them to go away. Direct navigation
                            still reaches it — `settings.tsx` renders its own empty state then. */}
                        {viewer.is_organizer && (
                            <Tab href={"/tournaments/$tournamentUuid/settings"} params={{ tournamentUuid }}>
                                {t("heading.settings")}
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
