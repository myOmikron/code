import { Outlet, createFileRoute } from "@tanstack/react-router";
import { LinkSlashIcon } from "@heroicons/react/20/solid";
import { Badge, EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { useDeckLabels } from "src/components/deck-labels";
import i18n from "src/i18n";
import { isDeadShareLink } from "src/utils/share-link";

export const Route = createFileRoute("/_menu/shared/decks/$token/_shared")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces("deck");
        try {
            const [deck] = await Promise.all([Api.shared.decks.get(params.token), strings]);
            return { deck };
        } catch (error) {
            if (isDeadShareLink(error)) {
                await strings;
                return { deck: null };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The chrome around a deck somebody shared: whose it is and the tabs.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { deck } = Route.useLoaderData();
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    if (deck === null) {
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
                heading={deck.name}
                headingDescription={
                    <span className={"flex flex-col gap-2"}>
                        {deck.description != null && deck.description !== "" && <span>{deck.description}</span>}
                        <span className={"flex flex-wrap items-center gap-2"}>
                            <Badge color={"blue"}>{labels.format(deck.format)}</Badge>
                            <span>{t("label.shared-by", { owner: deck.owner })}</span>
                        </span>
                    </span>
                }
                tabs={
                    <TabMenu>
                        <Tab href={"/shared/decks/$token/cards"} params={{ token }}>
                            {t("heading.cards")}
                        </Tab>
                        <Tab href={"/shared/decks/$token/statistics"} params={{ token }}>
                            {t("heading.statistics")}
                        </Tab>
                    </TabMenu>
                }
            >
                <Outlet />
            </TabLayout>
        </div>
    );
}
