import { Link, Outlet, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeftIcon, LinkIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    BadgeButton,
    Button,
    Tab,
    TabLayout,
    TabMenu,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CollectionDialog } from "src/components/collection-dialog";
import { RequireAccount } from "src/components/require-account";
import { ShareDialog } from "src/components/share-dialog";
import { collectionShareTarget } from "src/utils/share-targets";

/** How the mini buttons above the tabs are framed */
const ACTION_RING = "ring-1 ring-zinc-950/10 dark:ring-white/15";

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
    const [tg] = useTranslation();
    const router = useRouter();
    const navigate = useNavigate();
    const [sharing, setSharing] = useState(false);
    const [editing, setEditing] = useState(false);
    const [confirming, setConfirming] = useState(false);

    /**
     * Deletes the collection and leaves for the list it was in
     */
    async function remove() {
        setConfirming(false);
        await Api.collections.delete(collectionUuid);
        notify.success(t("toast.collection-deleted"));
        await navigate({ to: "/collections" });
    }

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
                    headingDescription={
                        <span className={"flex flex-col gap-3"}>
                            {collection.description !== "" && <span>{collection.description}</span>}
                            <span className={"flex flex-wrap items-center gap-2"}>
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setSharing(true)}>
                                    <LinkIcon className={"size-3.5"} />
                                    {t("button.share-collection")}
                                </BadgeButton>
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setEditing(true)}>
                                    <PencilSquareIcon className={"size-3.5"} />
                                    {t("button.edit-collection")}
                                </BadgeButton>
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setConfirming(true)}>
                                    <TrashIcon className={"size-3.5"} />
                                    {t("button.delete-collection")}
                                </BadgeButton>
                            </span>
                        </span>
                    }
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

                <ShareDialog
                    target={sharing ? collectionShareTarget(collection) : null}
                    description={t("description.share-link")}
                    onClose={() => setSharing(false)}
                    onChanged={() => router.invalidate()}
                />

                <CollectionDialog
                    open={editing}
                    collection={collection}
                    onClose={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        notify.success(t("toast.collection-updated"));
                        void router.invalidate();
                    }}
                />

                <Alert open={confirming} onClose={() => setConfirming(false)}>
                    <AlertTitle>{t("heading.delete-collection")}</AlertTitle>
                    <AlertDescription>{t("description.delete-collection", { name: collection.name })}</AlertDescription>
                    <AlertActions>
                        <Button plain onClick={() => setConfirming(false)}>
                            {tg("button.cancel")}
                        </Button>
                        <Button color={"red"} onClick={() => void remove()}>
                            {t("button.delete-collection")}
                        </Button>
                    </AlertActions>
                </Alert>
            </div>
        </RequireAccount>
    );
}
