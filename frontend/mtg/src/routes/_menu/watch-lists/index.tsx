import { ArrowTopRightOnSquareIcon, PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
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
import type { WatchListOverviewResponse } from "src/api/generated";
import { ContextMenu, useContextMenu } from "src/components/context-menu";
import type { ContextMenuSection } from "src/components/context-menu";
import { RequireAccount } from "src/components/require-account";
import { WatchListDialog } from "src/components/watch-list-dialog";
import { WatchListTile } from "src/components/watch-list-tile";
import { useShortcutHelpOpen } from "src/context/shortcut-help-context";
import i18n from "src/i18n";
import { useShortcuts } from "src/utils/use-shortcuts";

export const Route = createFileRoute("/_menu/watch-lists/")({
    // In the loader, so hovering the navbar entry already fetches the grid.
    loader: async () => {
        // `deck` comes along for the shortcut help dialog, which is shared
        // chrome and names itself out of that namespace. Nothing on this page
        // reads from it.
        await i18n.loadNamespaces(["watch-list", "deck"]);
        return Api.watchLists.list();
    },
    component: RouteComponent,
});

/**
 * The account's watch lists: the cards it is still after.
 *
 * Reads as the shelf of collections does, down to the keys: the two grids sit
 * one navigation entry apart, and somebody who has learnt `a`, `e` and `Entf`
 * on one should not have to learn them again on the other.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();
    const { lists } = Route.useLoaderData();
    const router = useRouter();
    const navigate = useNavigate();
    const [dialog, setDialog] = useState<{ list: WatchListOverviewResponse | null } | null>(null);
    const [confirming, setConfirming] = useState<WatchListOverviewResponse | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const menu = useContextMenu<WatchListOverviewResponse>();
    const shortcutHelpOpen = useShortcutHelpOpen();

    const marked = lists.find((overview) => overview.list.uuid === selected) ?? null;

    /**
     * Opens a watch list
     *
     * @param overview the list to open
     *
     * @returns a promise resolving once the router has navigated
     */
    const open = (overview: WatchListOverviewResponse) =>
        navigate({ to: "/watch-lists/$watchListUuid", params: { watchListUuid: overview.list.uuid } });

    useShortcuts(
        {
            a: () => setDialog({ list: null }),
            enter: () => {
                if (marked !== null) void open(marked);
            },
            e: () => {
                if (marked !== null) setDialog({ list: marked });
            },
            delete: () => {
                if (marked !== null) setConfirming(marked);
            },
        },
        dialog === null && confirming === null && menu.open === null && !shortcutHelpOpen,
    );

    /**
     * Re-runs the loader after a write, so the grid on screen matches the server
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Deletes a watch list after the confirmation was accepted
     *
     * @param overview the list to delete
     */
    async function remove(overview: WatchListOverviewResponse) {
        setConfirming(null);
        await Api.watchLists.delete(overview.list.uuid);
        notify.success(t("toast.list-deleted"));
        await refresh();
    }

    const sections: Array<ContextMenuSection> = [
        {
            key: "watch-list",
            items: [
                {
                    key: "open",
                    label: tg("button.open-watch-list"),
                    icon: <ArrowTopRightOnSquareIcon />,
                    onSelect: () => {
                        if (menu.open !== null) void open(menu.open.item);
                    },
                },
                {
                    key: "edit",
                    label: tg("button.edit-watch-list"),
                    icon: <PencilSquareIcon />,
                    onSelect: () => {
                        if (menu.open !== null) setDialog({ list: menu.open.item });
                    },
                },
                {
                    key: "delete",
                    label: tg("button.delete-watch-list"),
                    icon: <TrashIcon />,
                    tone: "danger",
                    onSelect: () => {
                        if (menu.open !== null) setConfirming(menu.open.item);
                    },
                },
            ],
        },
    ];

    return (
        <RequireAccount>
            <div className={"flex flex-col gap-6 p-4 sm:p-6"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div>
                        <Heading>{t("heading.watch-lists")}</Heading>
                        <Text className={"mt-1 max-w-2xl"}>{t("description.watch-lists")}</Text>
                    </div>
                    <PrimaryButton onClick={() => setDialog({ list: null })} className={"max-sm:w-full"}>
                        <PlusIcon />
                        {tg("button.create-watch-list")}
                    </PrimaryButton>
                </div>

                {lists.length === 0 ? (
                    <EmptyState
                        title={t("heading.no-lists")}
                        description={t("description.watch-lists")}
                        action={
                            <PrimaryButton onClick={() => setDialog({ list: null })}>
                                {tg("button.create-watch-list")}
                            </PrimaryButton>
                        }
                    />
                ) : (
                    <ul className={"grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
                        {lists.map((overview) => (
                            <WatchListTile
                                key={overview.list.uuid}
                                overview={overview}
                                onMenu={menu.openAt}
                                selected={selected === overview.list.uuid}
                                onActivate={() => setSelected(overview.list.uuid)}
                            />
                        ))}
                    </ul>
                )}
            </div>

            <WatchListDialog
                open={dialog !== null}
                list={dialog?.list?.list ?? null}
                onClose={() => setDialog(null)}
                onSaved={async (created) => {
                    setDialog(null);
                    notify.success(created === null ? t("toast.list-saved") : t("toast.list-created"));
                    await refresh();
                }}
            />

            <ContextMenu
                title={menu.open?.item.list.name}
                at={menu.open?.at ?? null}
                sections={sections}
                onClose={menu.close}
            />

            <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                <AlertTitle>{confirming?.list.name}</AlertTitle>
                <AlertDescription>{t("description.delete-list")}</AlertDescription>
                <AlertActions>
                    <Button plain onClick={() => setConfirming(null)}>
                        {tg("button.cancel")}
                    </Button>
                    <Button
                        color={"red"}
                        onClick={() => {
                            if (confirming !== null) void remove(confirming);
                        }}
                    >
                        {tg("button.delete-watch-list")}
                    </Button>
                </AlertActions>
            </Alert>
        </RequireAccount>
    );
}
