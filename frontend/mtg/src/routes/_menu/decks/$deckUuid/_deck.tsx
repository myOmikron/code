import { Link, Outlet, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
    ArchiveBoxIcon,
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    ArrowUturnLeftIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    FolderIcon,
    FolderMinusIcon,
    LinkIcon,
    PencilSquareIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import {
    Badge,
    BadgeButton,
    Dropdown,
    DropdownButton,
    DropdownDescription,
    DropdownDivider,
    DropdownItem,
    DropdownHeading,
    DropdownLabel,
    DropdownMenu,
    DropdownSection,
    Tab,
    TabLayout,
    TabMenu,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckDialog } from "src/components/deck-dialog";
import { DeckDeleteDialog } from "src/components/deck-delete-dialog";
import { DeckDissolveDialog } from "src/components/deck-dissolve-dialog";
import { ExportDeckDialog } from "src/components/export-deck-dialog";
import { ImportDeckDialog } from "src/components/import-deck-dialog";
import { useDeckLabels } from "src/components/deck-labels";
import { RequireAccount } from "src/components/require-account";
import { ShareDialog } from "src/components/share-dialog";
import { folderLabel } from "src/utils/deck-folders";
import { deckShareTarget } from "src/utils/share-targets";

/** How the mini buttons above the tabs are framed */
const ACTION_RING = "ring-1 ring-zinc-950/10 dark:ring-white/15";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck")({
    loader: async ({ params }) => {
        const [deck, offered, shelves] = await Promise.all([
            Api.decks.get(params.deckUuid),
            Api.decks.formats(),
            Api.folders.list(),
        ]);
        return { deck, formats: offered.formats, brackets: offered.brackets, folders: shelves.folders };
    },
    component: RouteComponent,
});

/**
 * The chrome around one deck: what it is, and the tabs holding cards and numbers.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { deck, formats, folders } = Route.useLoaderData();
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const router = useRouter();
    const navigate = useNavigate();
    const [sharing, setSharing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [editing, setEditing] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [dissolving, setDissolving] = useState(false);

    /**
     * Files the deck onto another shelf, or takes it off every one of them
     *
     * Putting a deck away is this with the archive: the same act, so the same
     * mechanism.
     *
     * @param folder the folder it goes into, `null` for none
     */
    async function move(folder: string | null) {
        await Api.decks.setFolder(deckUuid, folder);
        notify.success(t("toast.deck-moved"));
        await router.invalidate();
    }

    return (
        <RequireAccount>
            {/* The one page that wants the window rather than the column: a deck
                is a hundred cards, and the layout's own margin is the difference
                between eight of them in a row and six. A tenth of the window is
                kept on either side from `lg` up, minus what the layout already
                holds back, so the deck breathes without floating in the middle
                of an empty screen. */}
            <div className={"-mx-4 flex flex-col gap-2 sm:-mx-5 lg:mx-[calc(10vw-2.5rem)]"}>
                <Link
                    to={"/decks"}
                    className={"flex items-center gap-1 text-sm text-zinc-500 hover:underline dark:text-zinc-400"}
                >
                    <ChevronLeftIcon className={"size-4"} /> {t("button.back-to-decks")}
                </Link>
                <TabLayout
                    heading={deck.name}
                    headingDescription={
                        <span className={"flex flex-col gap-3"}>
                            {deck.description != null && deck.description !== "" && <span>{deck.description}</span>}
                            <span className={"flex flex-wrap items-center gap-2"}>
                                <Badge color={"blue"}>{labels.format(deck.format)}</Badge>
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setSharing(true)}>
                                    <LinkIcon className={"size-3.5"} />
                                    {t("button.share-deck")}
                                </BadgeButton>
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setEditing(true)}>
                                    <PencilSquareIcon className={"size-3.5"} />
                                    {t("button.edit-deck")}
                                </BadgeButton>
                            </span>
                        </span>
                    }
                    headingChildren={
                        <Dropdown>
                            <DropdownButton outline={true}>
                                {t("button.deck-actions")}
                                <ChevronDownIcon />
                            </DropdownButton>
                            <DropdownMenu anchor={"bottom end"}>
                                <DropdownItem onClick={() => setImporting(true)}>
                                    <ArrowDownTrayIcon />
                                    <DropdownLabel>{t("button.import")}</DropdownLabel>
                                    <DropdownDescription>{t("description.import-menu")}</DropdownDescription>
                                </DropdownItem>
                                <DropdownItem onClick={() => setExporting(true)}>
                                    <ArrowUpTrayIcon />
                                    <DropdownLabel>{t("button.export")}</DropdownLabel>
                                    <DropdownDescription>{t("description.export-menu")}</DropdownDescription>
                                </DropdownItem>
                                <DropdownDivider />
                                <DropdownItem onClick={() => setDissolving(true)}>
                                    <ArrowUturnLeftIcon />
                                    <DropdownLabel>{t("button.dissolve-deck")}</DropdownLabel>
                                    <DropdownDescription>{t("description.dissolve-menu")}</DropdownDescription>
                                </DropdownItem>
                                <DropdownDivider />
                                <DropdownSection>
                                    <DropdownHeading>{t("label.move-to-folder")}</DropdownHeading>
                                    {folders
                                        .filter((folder) => folder.uuid !== deck.folder)
                                        .map((folder) => (
                                            <DropdownItem key={folder.uuid} onClick={() => void move(folder.uuid)}>
                                                {folder.kind === "Archive" ? <ArchiveBoxIcon /> : <FolderIcon />}
                                                <DropdownLabel>
                                                    {folderLabel(folder, t("label.folder-archive"))}
                                                </DropdownLabel>
                                            </DropdownItem>
                                        ))}
                                    {deck.folder != null && (
                                        <DropdownItem onClick={() => void move(null)}>
                                            <FolderMinusIcon />
                                            <DropdownLabel>{t("label.folder-none")}</DropdownLabel>
                                        </DropdownItem>
                                    )}
                                </DropdownSection>
                                <DropdownDivider />
                                <DropdownItem onClick={() => setConfirming(true)}>
                                    <TrashIcon />
                                    <DropdownLabel>{t("button.delete-deck")}</DropdownLabel>
                                    <DropdownDescription>{t("description.delete-menu")}</DropdownDescription>
                                </DropdownItem>
                            </DropdownMenu>
                        </Dropdown>
                    }
                    tabs={
                        <TabMenu>
                            <Tab href={"/decks/$deckUuid/cards"} params={{ deckUuid }}>
                                {t("heading.cards")}
                            </Tab>
                            <Tab href={"/decks/$deckUuid/sourcing"} params={{ deckUuid }}>
                                {t("label.sourcing")}
                            </Tab>
                            <Tab href={"/decks/$deckUuid/statistics"} params={{ deckUuid }}>
                                {t("heading.statistics")}
                            </Tab>
                        </TabMenu>
                    }
                >
                    <Outlet />
                </TabLayout>

                <DeckDissolveDialog
                    deck={dissolving ? { uuid: deckUuid, name: deck.name } : null}
                    onClose={() => setDissolving(false)}
                    onDissolved={() => router.invalidate()}
                />

                <ExportDeckDialog open={exporting} source={{ deckUuid }} onClose={() => setExporting(false)} />

                <ImportDeckDialog
                    open={importing}
                    deckUuid={deckUuid}
                    onClose={() => setImporting(false)}
                    onImported={() => router.invalidate()}
                />

                <ShareDialog
                    target={sharing ? deckShareTarget(deck) : null}
                    description={t("description.share-link")}
                    onClose={() => setSharing(false)}
                    onChanged={() => router.invalidate()}
                />

                <DeckDialog
                    open={editing}
                    deck={deck}
                    formats={formats}
                    onClose={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        notify.success(t("toast.deck-updated"));
                        void router.invalidate();
                    }}
                />

                <DeckDeleteDialog
                    deck={confirming ? { uuid: deckUuid, name: deck.name } : null}
                    onClose={() => setConfirming(false)}
                    onDeleted={() => navigate({ to: "/decks" })}
                />
            </div>
        </RequireAccount>
    );
}
