import { NoSymbolIcon } from "@heroicons/react/20/solid";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Badge, Button, EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import { formatDateTime } from "src/utils/format";
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
 * The chrome around one tournament: its name, its status, and the tabs under it.
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
                    // The facts the overview tab used to hold a `DescriptionList` for, as one
                    // line of context. The venue is not among them: with an address, directions
                    // and a maps button it is three lines tall, and a heading is no place for it
                    // — the page below carries it instead.
                    <span className={"flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"}>
                        <Badge color={tournamentStatusColor(tournament.status)}>
                            {t(tournamentStatusLabelKey(tournament.status))}
                        </Badge>
                        {tournament.starts_at != null && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span>{formatDateTime(tournament.starts_at)}</span>
                            </>
                        )}
                    </span>
                }
                tabs={
                    <TabMenu>
                        {/* Exact matching, or the settings tab leaves this one lit beside it —
                            `/tournaments/$id` is a prefix of every route under it. */}
                        <Tab
                            href={"/tournaments/$tournamentUuid"}
                            params={{ tournamentUuid }}
                            activeOptions={{ exact: true }}
                        >
                            {t("heading.tournament")}
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
