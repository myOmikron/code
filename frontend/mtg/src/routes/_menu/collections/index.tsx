import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
    ArchiveBoxIcon,
    LockClosedIcon,
    LinkIcon,
    GlobeAltIcon,
    PencilSquareIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import type { BadgeProps } from "components";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    BadgeButton,
    Dropdown,
    DropdownButton,
    DropdownDescription,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    Button,
    EmptyState,
    Heading,
    PrimaryButton,
    StackedList,
    StackedListFlexRow,
    Text,
    notify,
} from "components";
import { useState } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CollectionDialog } from "src/components/collection-dialog";
import { RequireAccount } from "src/components/require-account";
import { Visibility } from "src/api/generated";
import type { CollectionResponse } from "src/api/generated";
import { formatDateTime } from "src/utils/format";

/** How each visibility is shown: colour, icon, label and the line under it */
const VISIBILITY_BADGE: Record<
    Visibility,
    {
        color: BadgeProps["color"];
        Icon: ComponentType<{ className?: string }>;
        key: string;
        descriptionKey: string;
    }
> = {
    Public: {
        color: "green",
        Icon: GlobeAltIcon,
        key: "label.visibility-public",
        descriptionKey: "description.visibility-public",
    },
    Unlisted: {
        color: "amber",
        Icon: LinkIcon,
        key: "label.visibility-unlisted",
        descriptionKey: "description.visibility-unlisted",
    },
    Private: {
        color: "zinc",
        Icon: LockClosedIcon,
        key: "label.visibility-private",
        descriptionKey: "description.visibility-private",
    },
};

/**
 * Menu order, from closed to open.
 *
 * Same order as the listbox in the create dialog, so the three states always
 * read as one scale rather than two arbitrary lists.
 */
const VISIBILITY_ORDER: Visibility[] = [Visibility.Private, Visibility.Unlisted, Visibility.Public];

export const Route = createFileRoute("/_menu/collections/")({
    // In the loader, so hovering the navbar entry already fetches the list.
    loader: () => Api.collections.list(),
    component: RouteComponent,
});

/**
 * The account's collections — each one is a physical container (a box, a binder, a shelf).
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const collections = Route.useLoaderData();
    const router = useRouter();
    const [dialog, setDialog] = useState<{ collection: CollectionResponse | null } | null>(null);
    const [confirming, setConfirming] = useState<CollectionResponse | null>(null);

    /**
     * Re-runs the loader after a write, so the list on screen matches the server
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Writes a collection's visibility straight from the badge menu
     *
     * @param collection the collection to change
     * @param visibility the visibility to switch to
     */
    async function changeVisibility(collection: CollectionResponse, visibility: Visibility) {
        if (collection.visibility === visibility) return;
        await Api.collections.setVisibility(collection.uuid, visibility);
        notify.success(t("toast.visibility-changed"));
        await refresh();
    }

    /**
     * Deletes a collection after the confirmation was accepted
     *
     * @param collection the collection to delete
     */
    async function remove(collection: CollectionResponse) {
        setConfirming(null);
        await Api.collections.delete(collection.uuid);
        notify.success(t("toast.collection-deleted"));
        await refresh();
    }

    return (
        <RequireAccount>
            <div className={"flex flex-col gap-6"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-2"}>
                        <Heading>{t("heading.collections")}</Heading>
                        <Text>{t("description.collections")}</Text>
                    </div>
                    <PrimaryButton onClick={() => setDialog({ collection: null })}>
                        {t("button.create-collection")}
                    </PrimaryButton>
                </div>

                {collections.length === 0 ? (
                    <EmptyState
                        icon={<ArchiveBoxIcon />}
                        title={t("heading.no-collections")}
                        description={t("description.no-collections")}
                    />
                ) : (
                    <StackedList>
                        {collections.map((collection) => {
                            const badge = VISIBILITY_BADGE[collection.visibility];
                            return (
                                <StackedListFlexRow key={collection.uuid}>
                                    <ArchiveBoxIcon
                                        className={"mt-1 size-5 shrink-0 text-zinc-400 dark:text-zinc-500"}
                                    />
                                    <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                                        {/* Straight to the cards rather than to the
                                            collection's index: that one only redirects
                                            here, and a link through a redirect cannot
                                            preload what it will end up showing. */}
                                        <Link
                                            to={"/collections/$collectionUuid/cards"}
                                            params={{ collectionUuid: collection.uuid }}
                                            className={
                                                "block truncate font-semibold text-zinc-950 hover:underline dark:text-white"
                                            }
                                        >
                                            {collection.name}
                                        </Link>
                                        {collection.description !== "" && (
                                            <Text className={"line-clamp-2"}>{collection.description}</Text>
                                        )}
                                        <div className={"flex flex-wrap items-center gap-2"}>
                                            {/* The badge is the shortest path to changing it — clicking
                                            the state you want to change beats hunting for a pencil at
                                            the other end of the row, and visibility has its own
                                            endpoint, so no dialog is needed in between. */}
                                            <Dropdown>
                                                <DropdownButton
                                                    as={BadgeButton}
                                                    color={badge.color}
                                                    aria-label={t("accessibility.change-visibility", {
                                                        name: collection.name,
                                                    })}
                                                >
                                                    <badge.Icon className={"size-3"} />
                                                    {t(badge.key)}
                                                </DropdownButton>
                                                <DropdownMenu anchor={"bottom start"}>
                                                    {VISIBILITY_ORDER.map((visibility) => {
                                                        const option = VISIBILITY_BADGE[visibility];
                                                        return (
                                                            <DropdownItem
                                                                key={visibility}
                                                                onClick={() =>
                                                                    void changeVisibility(collection, visibility)
                                                                }
                                                            >
                                                                <option.Icon />
                                                                <DropdownLabel>{t(option.key)}</DropdownLabel>
                                                                <DropdownDescription>
                                                                    {t(option.descriptionKey)}
                                                                </DropdownDescription>
                                                            </DropdownItem>
                                                        );
                                                    })}
                                                </DropdownMenu>
                                            </Dropdown>
                                        </div>
                                        <Text className={"text-xs"}>
                                            {t("label.created-on", { date: formatDateTime(collection.created_at) })}
                                        </Text>
                                    </div>
                                    <div className={"flex items-center gap-1"}>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.edit-collection", { name: collection.name })}
                                            onClick={() => setDialog({ collection })}
                                        >
                                            <PencilSquareIcon className={"size-5"} />
                                        </Button>
                                        <Button
                                            plain
                                            aria-label={t("accessibility.delete-collection", { name: collection.name })}
                                            onClick={() => setConfirming(collection)}
                                        >
                                            <TrashIcon className={"size-5"} />
                                        </Button>
                                    </div>
                                </StackedListFlexRow>
                            );
                        })}
                    </StackedList>
                )}

                {dialog !== null && (
                    // Keyed so switching between rows remounts the form — TanStack Form
                    // captures its defaults once, it does not follow a changing prop.
                    <CollectionDialog
                        key={dialog.collection?.uuid ?? "new"}
                        open={true}
                        collection={dialog.collection}
                        onClose={() => setDialog(null)}
                        onSaved={() => {
                            const created = dialog.collection === null;
                            setDialog(null);
                            notify.success(created ? t("toast.collection-created") : t("toast.collection-updated"));
                            void refresh();
                        }}
                    />
                )}

                <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                    <AlertTitle>{t("heading.delete-collection")}</AlertTitle>
                    <AlertDescription>
                        {t("description.delete-collection", { name: confirming?.name ?? "" })}
                    </AlertDescription>
                    <AlertActions>
                        <Button plain onClick={() => setConfirming(null)}>
                            {tg("button.cancel")}
                        </Button>
                        <Button color={"red"} onClick={() => void (confirming && remove(confirming))}>
                            {t("button.delete-collection")}
                        </Button>
                    </AlertActions>
                </Alert>
            </div>
        </RequireAccount>
    );
}
