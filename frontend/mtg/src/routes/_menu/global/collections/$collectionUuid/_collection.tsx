import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { EyeSlashIcon } from "@heroicons/react/20/solid";
import { EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import i18n from "src/i18n";
import { isNotPublic } from "src/utils/public-page";

export const Route = createFileRoute("/_menu/global/collections/$collectionUuid/_collection")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces("collection");
        try {
            const [collection] = await Promise.all([Api.explore.collections.get(params.collectionUuid), strings]);
            return { collection };
        } catch (error) {
            if (isNotPublic(error)) {
                await strings;
                return { collection: null };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The chrome around a collection somebody put on show: whose it is and the tabs.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const { collectionUuid } = Route.useParams();
    const { collection } = Route.useLoaderData();
    const [t] = useTranslation("collection");

    if (collection === null) {
        return (
            <EmptyState
                icon={<EyeSlashIcon />}
                title={t("heading.collection-not-public")}
                description={t("description.collection-not-public")}
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
                        <span>
                            {t("label.collected-by")}{" "}
                            <Link
                                to={"/global/profiles/$username"}
                                params={{ username: collection.owner }}
                                className={"font-medium hover:underline"}
                            >
                                {collection.owner}
                            </Link>
                        </span>
                    </span>
                }
                tabs={
                    <TabMenu>
                        <Tab href={"/global/collections/$collectionUuid/cards"} params={{ collectionUuid }}>
                            {t("heading.cards")}
                        </Tab>
                        <Tab href={"/global/collections/$collectionUuid/statistics"} params={{ collectionUuid }}>
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
