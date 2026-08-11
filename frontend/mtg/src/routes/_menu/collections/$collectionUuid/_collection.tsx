import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";
import { Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RequireAccount } from "src/components/require-account";

export const Route = createFileRoute("/_menu/collections/$collectionUuid/_collection")({
    // Only the collection itself, which is what the chrome around the tabs
    // needs. The stacks used to be loaded here as well, so that both tabs could
    // share them — but that meant every visit pulled the whole collection, five
    // figures of rows, before anything could be drawn. Each tab now asks for
    // what it actually shows: the card list for one page, the statistics for
    // the lot.
    loader: async ({ params }) => ({ collection: await Api.collections.get(params.collectionUuid) }),
    component: RouteComponent,
});

/**
 * The chrome around one collection: its name and the tabs holding cards and numbers.
 *
 * Pathless, so the cards stay at `/collections/{uuid}` and every existing link
 * to a collection keeps working.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const { collectionUuid } = Route.useParams();
    const { collection } = Route.useLoaderData();
    const [t] = useTranslation("collection");

    return (
        <RequireAccount>
            <div className={"flex flex-col gap-2"}>
                <Link
                    to={"/collections"}
                    className={"flex items-center gap-1 text-sm text-zinc-500 hover:underline dark:text-zinc-400"}
                >
                    <ChevronLeftIcon className={"size-4"} /> {t("button.back-to-collections")}
                </Link>
                <TabLayout
                    heading={collection.name}
                    headingDescription={collection.description !== "" ? collection.description : undefined}
                    tabs={
                        <TabMenu>
                            <Tab href={"/collections/$collectionUuid/cards"} params={{ collectionUuid }}>
                                {t("heading.cards")}
                            </Tab>
                            <Tab href={"/collections/$collectionUuid/statistics"} params={{ collectionUuid }}>
                                {t("heading.statistics")}
                            </Tab>
                        </TabMenu>
                    }
                >
                    <Outlet />
                </TabLayout>
            </div>
        </RequireAccount>
    );
}
