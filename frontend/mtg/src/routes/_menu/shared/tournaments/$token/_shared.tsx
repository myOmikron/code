import { Outlet, createFileRoute } from "@tanstack/react-router";
import { LinkSlashIcon } from "@heroicons/react/20/solid";
import { Badge, EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { useTournamentLabels } from "src/components/tournament-labels";
import i18n from "src/i18n";
import { isDeadShareLink } from "src/utils/share-link";

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces(["tournament", "deck"]);
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
 * The frame around a Tournament somebody shared by link: its name, who runs it and the tabs.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const [t] = useTranslation("tournament");
    const { token } = Route.useParams();
    const { tournament } = Route.useLoaderData();
    const labels = useTournamentLabels();

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
                </TabMenu>
            }
        >
            <Outlet />
        </TabLayout>
    );
}
