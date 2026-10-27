import { Outlet, createFileRoute, useRouter } from "@tanstack/react-router";
import { LinkSlashIcon } from "@heroicons/react/20/solid";
import { Badge, EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { useTournamentLabels } from "src/components/tournament-labels";
import { TournamentLiveProvider } from "src/context/tournament-live-context";
import i18n from "src/i18n";
import { isDeadShareLink } from "src/utils/share-link";
import { ownSeat, restoreGuestSeat } from "src/utils/tournament-guest";
import { sharedTournamentEventsUrl } from "src/utils/tournament-live";

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces(["tournament", "deck"]);
        try {
            const [tournament, listed] = await Promise.all([
                Api.shared.tournaments.get(params.token),
                Api.shared.tournaments.participants(params.token),
                strings,
            ]);
            const restored = await restoreGuestSeat(tournament, listed.me ?? null, (request) =>
                Api.shared.tournaments.recoverGuestSeat(params.token, request),
            );
            const participants = restored ? await Api.shared.tournaments.participants(params.token) : listed;
            return { tournament, ...ownSeat(participants) };
        } catch (error) {
            if (isDeadShareLink(error)) {
                await strings;
                return { tournament: null, ...ownSeat(null) };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The frame around a Tournament somebody shared by link: its name, who runs it and the tabs.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { token } = Route.useParams();
    const { tournament, me } = Route.useLoaderData();
    const labels = useTournamentLabels();
    const router = useRouter();
    const refresh = useCallback(() => void router.invalidate(), [router]);

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
        <TabLayout
            heading={tournament.name}
            headingDescription={
                <span className={"flex flex-wrap items-center gap-2"}>
                    <Badge color={"sky"}>{labels.state(tournament.state)}</Badge>
                    {me !== null && <Badge color={"lime"}>{t("label.you-participate")}</Badge>}
                    <span>{labels.organizedBy(tournament.owner)}</span>
                </span>
            }
            tabs={
                <TabMenu>
                    <Tab href={"/shared/tournaments/$token"} params={{ token }} activeOptions={{ exact: true }}>
                        {t("heading.overview")}
                    </Tab>
                    <Tab href={"/shared/tournaments/$token/participants"} params={{ token }}>
                        {t("heading.participants")}
                    </Tab>
                    <Tab href={"/shared/tournaments/$token/rounds"} params={{ token }}>
                        {t("heading.rounds")}
                    </Tab>
                    <Tab href={"/shared/tournaments/$token/standings"} params={{ token }}>
                        {t("heading.standings")}
                    </Tab>
                    {tournament.top_cut != null && (
                        <Tab href={"/shared/tournaments/$token/top-cut"} params={{ token }}>
                            {t("heading.top-cut")}
                        </Tab>
                    )}
                </TabMenu>
            }
        >
            <TournamentLiveProvider url={sharedTournamentEventsUrl(token)} onTournamentChanged={refresh}>
                <Outlet />
            </TournamentLiveProvider>
        </TabLayout>
    );
}
