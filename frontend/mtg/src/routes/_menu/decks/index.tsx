import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
    ArrowTopRightOnSquareIcon,
    ChevronRightIcon,
    FolderIcon,
    FolderMinusIcon,
    LinkIcon,
    MagnifyingGlassIcon,
    PencilSquareIcon,
    RectangleStackIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, EmptyState, Heading, Input, InputGroup, PrimaryButton, Text, notify } from "components";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckFolderResponse, DeckOverviewResponse, FormatRulesResponse, Visibility } from "src/api/generated";
import { DeckDeleteDialog } from "src/components/deck-delete-dialog";
import { DeckFolderDialog } from "src/components/deck-folder-dialog";
import { DeckDialog } from "src/components/deck-dialog";
import { DeckDissolveDialog } from "src/components/deck-dissolve-dialog";
import { useDeckLabels } from "src/components/deck-labels";
import { ContextMenu, useContextMenu } from "src/components/context-menu";
import type { ContextMenuSection } from "src/components/context-menu";
import {
    DeckTile,
    VISIBILITY_ICON as DECK_VISIBILITY_ICON,
    VISIBILITY_LABEL as DECK_VISIBILITY_LABEL,
    VISIBILITY_ORDER as DECK_VISIBILITY_ORDER,
} from "src/components/deck-tile";
import { RequireAccount } from "src/components/require-account";
import { useAccount } from "src/context/account";
import { ShareDialog } from "src/components/share-dialog";
import { useFolderCollapse } from "src/utils/deck-folder-collapse";
import { byFolder, folderLabel } from "src/utils/deck-folders";
import { formatCurrency } from "src/utils/format";
import { deckShareTarget } from "src/utils/share-targets";
import { useShortcuts } from "src/utils/use-shortcuts";
import { useShortcutHelpOpen } from "src/context/shortcut-help-context";

export const Route = createFileRoute("/_menu/decks/")({
    loader: async () => {
        const [decks, offered, shelves] = await Promise.all([
            Api.decks.list(),
            Api.decks.formats(),
            Api.folders.list(),
        ]);
        return { decks, formats: offered.formats, folders: shelves.folders };
    },
    component: RouteComponent,
});

/**
 * The account's decks, by the face at the head of each.
 *
 * Filed onto the shelves the account arranged, and sorted into formats inside
 * each: which pile a deck belongs to is a decision somebody made, and the
 * format answers "which of these can I bring tonight" once that pile is open.
 * Decks on no shelf close the list, so every deck is somewhere.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("deck");
    const { decks, formats, folders } = Route.useLoaderData();
    const router = useRouter();
    const navigate = useNavigate();
    const labels = useDeckLabels();
    const shortcutHelpOpen = useShortcutHelpOpen();

    const [dialog, setDialog] = useState<{ deck: DeckOverviewResponse | null } | null>(null);
    const [sharing, setSharing] = useState<DeckOverviewResponse | null>(null);
    const [confirming, setConfirming] = useState<DeckOverviewResponse | null>(null);
    const [dissolving, setDissolving] = useState<DeckOverviewResponse | null>(null);
    const [managingFolders, setManagingFolders] = useState(false);
    const { account } = useAccount();
    const folds = useFolderCollapse(account?.uuid ?? null);
    const [selected, setSelected] = useState<string | null>(null);
    const menu = useContextMenu<DeckOverviewResponse>();
    const [query, setQuery] = useState("");
    const field = useRef<HTMLInputElement>(null);

    const matching = filtered(decks, query);
    // A shelf holding nothing is worth showing while the whole list is on
    // screen — it is where the next deck goes — and only noise while a search
    // is narrowing things down.
    const searching = query.trim() !== "";
    const sections = byFolder(matching, folders, !searching);
    const counts = Object.fromEntries(
        folders.map((folder) => [folder.uuid, decks.filter((overview) => overview.deck.folder === folder.uuid).length]),
    );
    const selectedDeck = matching.find((overview) => overview.deck.uuid === selected) ?? null;
    const cards = decks.reduce((sum, overview) => sum + overview.cards, 0);
    const value = decks.reduce((sum, overview) => sum + overview.price_eur_cents, 0);

    useShortcuts(
        {
            "mod+f": () => {
                field.current?.focus();
                field.current?.select();
            },
            a: () => setDialog({ deck: null }),
            e: () => {
                if (selectedDeck !== null) setDialog({ deck: selectedDeck });
            },
            s: () => {
                if (selectedDeck !== null) setSharing(selectedDeck);
            },
            delete: () => {
                if (selectedDeck !== null) setConfirming(selectedDeck);
            },
        },
        dialog === null && sharing === null && confirming === null && !shortcutHelpOpen,
    );

    /**
     * Re-runs the loader after a write
     *
     * @returns a promise resolving once the loader has finished
     */
    const refresh = () => router.invalidate();

    /**
     * Writes a deck's visibility straight from its menu
     *
     * @param overview the deck to change
     * @param visibility the visibility to switch to
     */
    async function changeVisibility(overview: DeckOverviewResponse, visibility: Visibility) {
        if (overview.deck.visibility === visibility) return;
        await Api.decks.setVisibility(overview.deck.uuid, visibility);
        notify.success(t("toast.visibility-changed"));
        await refresh();
    }

    /**
     * Files a deck onto another shelf, or takes it off every one of them
     *
     * @param overview the deck to move
     * @param folder the folder it goes into, `null` for none
     */
    async function move(overview: DeckOverviewResponse, folder: string | null) {
        if ((overview.deck.folder ?? null) === folder) return;
        await Api.decks.setFolder(overview.deck.uuid, folder);
        notify.success(t("toast.deck-moved"));
        await refresh();
    }

    /**
     * Makes a folder
     *
     * @param name what it is called
     */
    async function createFolder(name: string) {
        await Api.folders.create(name);
        notify.success(t("toast.folder-created"));
        await refresh();
    }

    /**
     * Renames a folder
     *
     * @param folder the folder being renamed
     * @param name what it is called now
     */
    async function renameFolder(folder: DeckFolderResponse, name: string) {
        await Api.folders.rename(folder.uuid, name);
        notify.success(t("toast.folder-renamed"));
        await refresh();
    }

    /**
     * Throws a folder away, leaving the decks in it unfiled
     *
     * @param folder the folder to remove
     */
    async function deleteFolder(folder: DeckFolderResponse) {
        await Api.folders.delete(folder.uuid);
        notify.success(t("toast.folder-deleted"));
        await refresh();
    }

    /**
     * What one deck can be told from its menu
     *
     * @param overview the deck the menu was opened on
     *
     * @returns the lines, in the order the shortcuts are learnt
     */
    function sectionsFor(overview: DeckOverviewResponse): Array<ContextMenuSection> {
        return [
            {
                key: "deck",
                items: [
                    {
                        key: "open",
                        label: t("button.open-deck"),
                        icon: <ArrowTopRightOnSquareIcon />,
                        onSelect: () =>
                            void navigate({
                                to: "/decks/$deckUuid/cards",
                                params: { deckUuid: overview.deck.uuid },
                            }),
                    },
                    {
                        key: "share",
                        label: t("button.share-deck"),
                        icon: <LinkIcon />,
                        shortcut: "S",
                        onSelect: () => setSharing(overview),
                    },
                    {
                        key: "edit",
                        label: t("button.edit-deck"),
                        icon: <PencilSquareIcon />,
                        shortcut: "E",
                        onSelect: () => setDialog({ deck: overview }),
                    },
                ],
            },
            {
                key: "visibility",
                heading: t("label.visibility"),
                items: DECK_VISIBILITY_ORDER.filter((visibility) => visibility !== overview.deck.visibility).map(
                    (visibility) => {
                        const Icon = DECK_VISIBILITY_ICON[visibility];
                        return {
                            key: visibility,
                            label: t(DECK_VISIBILITY_LABEL[visibility]),
                            icon: <Icon />,
                            onSelect: () => void changeVisibility(overview, visibility),
                        };
                    },
                ),
            },
            {
                key: "folder",
                heading: t("label.move-to-folder"),
                items: [
                    ...folders
                        .filter((folder) => folder.uuid !== overview.deck.folder)
                        .map((folder) => ({
                            key: folder.uuid,
                            label: folderLabel(folder, t("label.folder-archive")),
                            icon: <FolderIcon />,
                            onSelect: () => void move(overview, folder.uuid),
                        })),
                    ...(overview.deck.folder == null
                        ? []
                        : [
                              {
                                  key: "none",
                                  label: t("label.folder-none"),
                                  icon: <FolderMinusIcon />,
                                  onSelect: () => void move(overview, null),
                              },
                          ]),
                ],
            },
            {
                key: "delete",
                items: [
                    {
                        key: "delete",
                        label: t("button.delete-deck"),
                        icon: <TrashIcon />,
                        tone: "danger",
                        onSelect: () => setConfirming(overview),
                    },
                ],
            },
        ];
    }

    return (
        <RequireAccount>
            <div className={"flex flex-col gap-6"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-2"}>
                        <Heading>{t("heading.decks")}</Heading>
                        {decks.length === 0 ? (
                            <Text>{t("description.decks")}</Text>
                        ) : (
                            <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                                <span>{t("label.deck-count", { count: decks.length })}</span>
                                <span aria-hidden={true}>·</span>
                                <span className={"tabular-nums"}>{t("label.deck-size", { cards })}</span>
                                {value > 0 && (
                                    <>
                                        <span aria-hidden={true}>·</span>
                                        <span className={"tabular-nums"}>{formatCurrency(value / 100)}</span>
                                    </>
                                )}
                            </Text>
                        )}
                    </div>
                    <div className={"flex items-center gap-2"}>
                        <Button outline={true} onClick={() => setManagingFolders(true)}>
                            <FolderIcon />
                            {t("button.manage-folders")}
                        </Button>
                        <PrimaryButton onClick={() => setDialog({ deck: null })}>
                            {t("button.create-deck")}
                        </PrimaryButton>
                    </div>
                </div>

                {decks.length > 0 && (
                    <div className={"max-w-sm"}>
                        <InputGroup>
                            <MagnifyingGlassIcon />
                            <Input
                                ref={field}
                                value={query}
                                aria-label={t("label.search-decks")}
                                placeholder={t("label.search-decks")}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") setQuery("");
                                }}
                            />
                        </InputGroup>
                    </div>
                )}

                {decks.length === 0 ? (
                    <EmptyState
                        icon={<RectangleStackIcon />}
                        title={t("heading.no-decks")}
                        description={t("description.no-decks")}
                    />
                ) : matching.length === 0 ? (
                    <EmptyState
                        icon={<MagnifyingGlassIcon />}
                        title={t("heading.no-decks-found")}
                        description={t("description.no-decks-found")}
                    />
                ) : (
                    sections.map((section) => {
                        const archive = section.folder?.kind === "Archive";
                        // A search shows what it found: a shelf folded shut
                        // would hide a hit and read as "nothing there".
                        const open = searching || !folds.collapsed(section.key);
                        return (
                            <section key={section.key} className={"flex flex-col gap-4"}>
                                <div className={"flex items-center gap-3"}>
                                    <button
                                        type={"button"}
                                        aria-expanded={open}
                                        onClick={() => folds.toggle(section.key)}
                                        className={
                                            "-mx-1 flex min-w-0 items-center gap-2 rounded px-1 py-0.5 hover:bg-zinc-950/5 dark:hover:bg-white/10"
                                        }
                                    >
                                        <ChevronRightIcon
                                            aria-hidden={true}
                                            className={clsx(
                                                "size-4 shrink-0 text-zinc-500 transition-transform dark:text-zinc-400",
                                                open && "rotate-90",
                                            )}
                                        />
                                        <h2
                                            className={clsx(
                                                "truncate text-base/7 font-semibold",
                                                archive || section.folder === null
                                                    ? "text-zinc-500 dark:text-zinc-400"
                                                    : "text-zinc-950 dark:text-white",
                                            )}
                                        >
                                            {section.folder === null
                                                ? t("heading.unfiled-decks")
                                                : folderLabel(section.folder, t("label.folder-archive"))}
                                        </h2>
                                    </button>
                                    <span
                                        className={
                                            "rounded-(--radius-pill) bg-zinc-950/5 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:bg-white/10 dark:text-zinc-300"
                                        }
                                    >
                                        {section.decks.length}
                                    </span>
                                    <span className={"h-px flex-1 bg-zinc-950/5 dark:bg-white/10"} />
                                </div>

                                {!open ? null : section.decks.length === 0 ? (
                                    <Text className={"text-xs"}>{t("description.folder-empty")}</Text>
                                ) : (
                                    byFormat(section.decks, formats).map((group) => (
                                        <div key={group.format} className={"flex flex-col gap-3"}>
                                            <div className={"flex items-center gap-2 pl-1"}>
                                                <h3
                                                    className={
                                                        "text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400"
                                                    }
                                                >
                                                    {labels.format(group.format)}
                                                </h3>
                                                <span
                                                    className={"text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}
                                                >
                                                    {group.decks.length}
                                                </span>
                                            </div>

                                            <ul
                                                className={clsx(
                                                    "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
                                                    archive && "opacity-75",
                                                )}
                                            >
                                                {group.decks.map((overview) => (
                                                    <DeckTile
                                                        key={overview.deck.uuid}
                                                        overview={overview}
                                                        rules={formats.find(
                                                            (rules) => rules.slug === overview.deck.format,
                                                        )}
                                                        onMenu={menu.openAt}
                                                        selected={selected === overview.deck.uuid}
                                                        onActivate={() => setSelected(overview.deck.uuid)}
                                                    />
                                                ))}
                                            </ul>
                                        </div>
                                    ))
                                )}
                            </section>
                        );
                    })
                )}

                <ContextMenu
                    title={menu.open?.item.deck.name}
                    at={menu.open?.at ?? null}
                    sections={menu.open === null ? [] : sectionsFor(menu.open.item)}
                    onClose={menu.close}
                />

                <DeckDialog
                    open={dialog !== null}
                    deck={dialog?.deck?.deck ?? null}
                    formats={formats}
                    folders={folders}
                    onClose={() => setDialog(null)}
                    onSaved={(created) => {
                        setDialog(null);
                        notify.success(created !== null ? t("toast.deck-created") : t("toast.deck-updated"));
                        if (created !== null) {
                            void navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: created.uuid } });
                            return;
                        }
                        void refresh();
                    }}
                />

                <ShareDialog
                    target={sharing === null ? null : deckShareTarget(sharing.deck)}
                    description={t("description.share-link")}
                    onClose={() => setSharing(null)}
                    onChanged={refresh}
                />

                <DeckDeleteDialog
                    deck={confirming === null ? null : { uuid: confirming.deck.uuid, name: confirming.deck.name }}
                    onClose={() => setConfirming(null)}
                    onDeleted={refresh}
                />

                <DeckFolderDialog
                    open={managingFolders}
                    folders={folders}
                    counts={counts}
                    onCreate={(name) => void createFolder(name)}
                    onRename={renameFolder}
                    onDelete={(folder) => void deleteFolder(folder)}
                    onClose={() => setManagingFolders(false)}
                />

                <DeckDissolveDialog
                    deck={dissolving === null ? null : { uuid: dissolving.deck.uuid, name: dissolving.deck.name }}
                    onClose={() => setDissolving(null)}
                    onDissolved={refresh}
                />
            </div>
        </RequireAccount>
    );
}

/**
 * The decks whose name or commander answers to what was typed
 *
 * @param decks every deck
 * @param query what was typed
 *
 * @returns the ones that match, all of them for an empty field
 */
function filtered(decks: Array<DeckOverviewResponse>, query: string): Array<DeckOverviewResponse> {
    const wanted = query.trim().toLowerCase();
    if (wanted === "") return decks;

    return decks.filter(
        (overview) =>
            overview.deck.name.toLowerCase().includes(wanted) ||
            overview.commanders.some((commander) => commander.name.toLowerCase().includes(wanted)),
    );
}

/**
 * The decks sorted into the formats they are built for
 *
 * The formats keep the order the service offers them in, which puts Commander
 * first; a deck built for a format the service no longer knows lands at the end
 * under its own slug rather than disappearing.
 *
 * @param decks the decks to sort
 * @param formats the formats the service offers
 *
 * @returns one group per format that holds decks
 */
function byFormat(
    decks: Array<DeckOverviewResponse>,
    formats: Array<FormatRulesResponse>,
): Array<{ format: string; decks: Array<DeckOverviewResponse> }> {
    const groups = new Map<string, Array<DeckOverviewResponse>>();
    for (const overview of decks) {
        const group = groups.get(overview.deck.format);
        if (group === undefined) groups.set(overview.deck.format, [overview]);
        else group.push(overview);
    }

    const order = formats.map((rules) => rules.slug);
    return Array.from(groups, ([format, inGroup]) => ({ format, decks: inGroup })).sort((left, right) => {
        const ranked = rank(order, left.format) - rank(order, right.format);
        return ranked === 0 ? left.format.localeCompare(right.format) : ranked;
    });
}

/**
 * Where a format sits in the offered order
 *
 * @param order the offered formats
 * @param format the format
 *
 * @returns its position, anything unknown at the end
 */
function rank(order: Array<string>, format: string): number {
    const index = order.indexOf(format);
    return index === -1 ? order.length : index;
}
