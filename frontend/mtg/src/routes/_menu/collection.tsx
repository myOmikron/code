import { createFileRoute } from "@tanstack/react-router";
import {
    ArchiveBoxIcon,
    LockClosedIcon,
    LinkIcon,
    GlobeAltIcon,
    PencilSquareIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Badge,
    Button,
    EmptyState,
    Heading,
    PrimaryButton,
    StackedList,
    StackedListFlexRow,
    Strong,
    Text,
    notify,
} from "components";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CollectionDialog } from "src/components/collection-dialog";
import { RequireAccount } from "src/components/require-account";
import { Visibility } from "src/api/generated";
import type { CollectionResponse } from "src/api/generated";
import { formatDateTime } from "src/utils/format";

export const Route = createFileRoute("/_menu/collection")({
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
    const [collections, setCollections] = useState<CollectionResponse[] | null>(null);
    const [dialog, setDialog] = useState<{ collection: CollectionResponse | null } | null>(null);
    const [confirming, setConfirming] = useState<CollectionResponse | null>(null);

    const refresh = useCallback(async () => {
        setCollections(await Api.collections.list());
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

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

                {collections !== null &&
                    (collections.length === 0 ? (
                        <EmptyState
                            icon={<ArchiveBoxIcon />}
                            title={t("heading.no-collections")}
                            description={t("description.no-collections")}
                        />
                    ) : (
                        <StackedList>
                            {collections.map((collection) => (
                                <StackedListFlexRow key={collection.uuid}>
                                    <ArchiveBoxIcon
                                        className={"mt-1 size-5 shrink-0 text-zinc-400 dark:text-zinc-500"}
                                    />
                                    <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                                        <Strong className={"block truncate"}>{collection.name}</Strong>
                                        {collection.description !== "" && (
                                            <Text className={"line-clamp-2"}>{collection.description}</Text>
                                        )}
                                        <div className={"flex flex-wrap items-center gap-2"}>
                                            {collection.visibility === Visibility.Public && (
                                                <Badge color={"green"}>
                                                    <GlobeAltIcon className={"size-3"} />
                                                    {t("label.visibility-public")}
                                                </Badge>
                                            )}
                                            {collection.visibility === Visibility.Unlisted && (
                                                <Badge color={"amber"}>
                                                    <LinkIcon className={"size-3"} />
                                                    {t("label.visibility-unlisted")}
                                                </Badge>
                                            )}
                                            {collection.visibility === Visibility.Private && (
                                                <Badge color={"zinc"}>
                                                    <LockClosedIcon className={"size-3"} />
                                                    {t("label.visibility-private")}
                                                </Badge>
                                            )}
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
                            ))}
                        </StackedList>
                    ))}

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
