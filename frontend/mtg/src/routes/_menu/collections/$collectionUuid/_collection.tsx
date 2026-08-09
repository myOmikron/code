import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";
import { Tab, TabLayout, TabMenu } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { RequireAccount } from "src/components/require-account";

export const Route = createFileRoute("/_menu/collections/$collectionUuid/_collection")({
    // In the loader rather than in an effect, so hovering the link on the
    // overview already fetches the entries.
    //
    // It sits on the layout, not on a tab: both tabs read the same entries, and
    // switching between them must not refetch anything.
    //
    // What is deliberately *not* here is resolving the printings against
    // Scryfall. An imported collection runs to five figures, and looking every
    // card up before the page may render meant staring at nothing for minutes.
    // Each tab now asks for the cards it actually shows.
    loader: async ({ params }) => {
        // The list is the only way to the collection's name today — there is no
        // single-collection GET yet.
        const [all, listed] = await Promise.all([
            Api.collections.list(),
            Api.collections.entries.list(params.collectionUuid),
        ]);
        return {
            collection: all.find((candidate) => candidate.uuid === params.collectionUuid) ?? null,
            entries: listed.entries,
        };
    },
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
                    heading={collection?.name ?? ""}
                    headingDescription={collection?.description !== "" ? collection?.description : undefined}
                    tabs={
                        <TabMenu>
                            {/* Exact, or the cards tab stays underlined on the
                                statistics tab — its path is a prefix of it. */}
                            <Tab
                                href={"/collections/$collectionUuid"}
                                params={{ collectionUuid }}
                                activeOptions={{ exact: true }}
                            >
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
