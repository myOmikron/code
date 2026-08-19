import { ArchiveBoxIcon } from "@heroicons/react/20/solid";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Button,
    EmptyState,
    Heading,
    PrimaryButton,
    Text,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollectionOverviewResponse, Visibility } from "src/api/generated";
import { CollectionDialog } from "src/components/collection-dialog";
import { CollectionTile } from "src/components/collection-tile";
import { RequireAccount } from "src/components/require-account";
import { ShareDialog } from "src/components/share-dialog";
import { formatCurrency } from "src/utils/format";
import { collectionShareTarget } from "src/utils/share-targets";

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
    const navigate = useNavigate();
    const [dialog, setDialog] = useState<{ collection: CollectionOverviewResponse | null } | null>(null);
    const [sharing, setSharing] = useState<CollectionOverviewResponse | null>(null);
    const [confirming, setConfirming] = useState<CollectionOverviewResponse | null>(null);

    const cards = collections.reduce((total, overview) => total + overview.cards, 0);
    const value = collections.reduce((total, overview) => total + overview.price_eur_cents, 0);

    /**
     * Re-runs the loader after a write, so the list on screen matches the server
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Writes a collection's visibility straight from the badge menu
     *
     * @param overview the collection to change
     * @param visibility the visibility to switch to
     */
    async function changeVisibility(overview: CollectionOverviewResponse, visibility: Visibility) {
        if (overview.collection.visibility === visibility) return;
        await Api.collections.setVisibility(overview.collection.uuid, visibility);
        notify.success(t("toast.visibility-changed"));
        await refresh();
    }

    /**
     * Deletes a collection after the confirmation was accepted
     *
     * @param overview the collection to delete
     */
    async function remove(overview: CollectionOverviewResponse) {
        setConfirming(null);
        await Api.collections.delete(overview.collection.uuid);
        notify.success(t("toast.collection-deleted"));
        await refresh();
    }

    return (
        <RequireAccount>
            <div className={"flex flex-col gap-6"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-2"}>
                        <Heading>{t("heading.collections")}</Heading>
                        {collections.length === 0 ? (
                            <Text>{t("description.collections")}</Text>
                        ) : (
                            <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                                <span>{t("label.collection-count", { count: collections.length })}</span>
                                <span aria-hidden={true}>·</span>
                                <span className={"tabular-nums"}>{t("label.card-count", { cards })}</span>
                                {value > 0 && (
                                    <>
                                        <span aria-hidden={true}>·</span>
                                        <span className={"tabular-nums"}>{formatCurrency(value / 100)}</span>
                                    </>
                                )}
                            </Text>
                        )}
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
                    <ul className={"grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                        {collections.map((overview) => (
                            <CollectionTile
                                key={overview.collection.uuid}
                                overview={overview}
                                onChangeVisibility={(target, visibility) => void changeVisibility(target, visibility)}
                                onShare={setSharing}
                                onEdit={(collection) => setDialog({ collection })}
                                onDelete={setConfirming}
                            />
                        ))}
                    </ul>
                )}

                <CollectionDialog
                    open={dialog !== null}
                    collection={dialog?.collection?.collection ?? null}
                    onClose={() => setDialog(null)}
                    onSaved={(created) => {
                        setDialog(null);
                        notify.success(
                            created !== null ? t("toast.collection-created") : t("toast.collection-updated"),
                        );
                        // A new box is made to be filled, so that is where
                        // this ends up. The list behind it reloads on its
                        // own the next time it is looked at.
                        if (created !== null) {
                            void navigate({
                                to: "/collections/$collectionUuid/cards",
                                params: { collectionUuid: created.uuid },
                            });
                            return;
                        }
                        void refresh();
                    }}
                />

                <ShareDialog
                    target={sharing === null ? null : collectionShareTarget(sharing.collection)}
                    description={t("description.share-link")}
                    onClose={() => setSharing(null)}
                    onChanged={refresh}
                />

                <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                    <AlertTitle>{t("heading.delete-collection")}</AlertTitle>
                    <AlertDescription>
                        {t("description.delete-collection", { name: confirming?.collection.name ?? "" })}
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
