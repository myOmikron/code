import { Outlet, createFileRoute } from "@tanstack/react-router";
import { LinkSlashIcon } from "@heroicons/react/20/solid";
import { EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import i18n from "src/i18n";
import { isDeadShareLink } from "src/utils/share-link";

export const Route = createFileRoute("/_menu/shared/collections/$token/_shared")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces("collection");
        try {
            const [collection] = await Promise.all([Api.shared.collections.get(params.token), strings]);
            return { collection };
        } catch (error) {
            if (isDeadShareLink(error)) {
                await strings;
                return { collection: null };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The chrome around a collection somebody shared: whose it is and the tabs.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { collection } = Route.useLoaderData();
    const [t] = useTranslation("collection");

    if (collection === null) {
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
                heading={collection.name}
                headingDescription={
                    <span className={"flex flex-col gap-1"}>
                        {collection.description !== "" && <span>{collection.description}</span>}
                        <span>{t("label.shared-by", { owner: collection.owner })}</span>
                    </span>
                }
                tabs={
                    <TabMenu>
                        <Tab href={"/shared/collections/$token/cards"} params={{ token }}>
                            {t("heading.cards")}
                        </Tab>
                        <Tab href={"/shared/collections/$token/statistics"} params={{ token }}>
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
