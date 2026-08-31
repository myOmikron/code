import { Link, Outlet, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
    ArchiveBoxIcon,
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    ArrowUturnLeftIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    DocumentDuplicateIcon,
    ExclamationTriangleIcon,
    FolderIcon,
    FolderMinusIcon,
    LinkIcon,
    PencilSquareIcon,
    PrinterIcon,
    TrashIcon,
    UserGroupIcon,
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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckBracketPicker } from "src/components/deck-bracket-picker";
import { DeckDialog } from "src/components/deck-dialog";
import { DeckDeleteDialog } from "src/components/deck-delete-dialog";
import { DeckDissolveDialog } from "src/components/deck-dissolve-dialog";
import { DeckRuleZeroDialog } from "src/components/deck-rule-zero-dialog";
import { ExportDeckDialog } from "src/components/export-deck-dialog";
import { ImportDeckDialog } from "src/components/import-deck-dialog";
import { useDeckLabels } from "src/components/deck-labels";
import { RequireAccount } from "src/components/require-account";
import { ShareDialog } from "src/components/share-dialog";
import { folderLabel } from "src/utils/deck-folders";
import { commanderColors, letters, ruleZeroCount } from "src/utils/deck-rules";
import { deckShareTarget } from "src/utils/share-targets";
import { driftCopies } from "src/utils/deck-drift";
import { forgetIgnored } from "src/utils/deck-ignore";
import { forgetPoolQuery } from "src/utils/deck-pool";
import { forgetThemePrefs } from "src/utils/deck-theme-prefs";

/** How the mini buttons above the tabs are framed */
const ACTION_RING = "ring-1 ring-zinc-950/10 dark:ring-white/15";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck")({
    loader: async ({ params }) => {
        const [deck, offered, shelves, drift] = await Promise.all([
            Api.decks.get(params.deckUuid),
            Api.decks.formats(),
            Api.folders.list(),
            Api.decks.drift(params.deckUuid),
        ]);
        return {
            deck,
            formats: offered.formats,
            // Brackets are Commander's own, so a deck in any other format is
            // handed none and every reader of this loader — the chrome, the
            // cards tab, the advisor — stops offering and checking them at
            // once. The picker draws nothing for an empty list.
            brackets:
                offered.formats.find((rules) => rules.slug === deck.format)?.has_brackets === true
                    ? offered.brackets
                    : [],
            folders: shelves.folders,
            drift,
        };
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
    const { deck, formats, brackets, folders, drift } = Route.useLoaderData();
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
    const [editingRuleZero, setEditingRuleZero] = useState(false);
    const [commanderIdentity, setCommanderIdentity] = useState<Array<string>>([]);
    const [hasProxies, setHasProxies] = useState(false);

    const deviations = ruleZeroCount(deck);
    // What the list and the deck's own collection disagree about. Said in the
    // header rather than on the sourcing tab alone: somebody swapping a
    // printing while building is exactly the person who will not open that tab.
    const drifted = driftCopies(drift);
    const rules = formats.find((format) => format.slug === deck.format);

    // This layout never loads the card list, but the Rule 0 picker should
    // start from the commander's colours all the same — so they are fetched
    // when the dialog opens, and only then. The dialog reseeds itself when
    // they land, unless the picker was already touched.
    useEffect(() => {
        if (!editingRuleZero || deck.allowed_color_identity != null) return;
        let gone = false;
        Api.decks.cards
            .list(deckUuid)
            .then(({ cards }) => {
                if (!gone) setCommanderIdentity(commanderColors(cards.filter((card) => card.zone === "Commander")));
            })
            // `handleError` has already reported the failure; the picker
            // simply starts empty, which is also where a claim starts.
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [editingRuleZero, deckUuid, deck.allowed_color_identity]);

    // Whether the export dropdown offers "Print proxy slots" beside the plain
    // "Print proxies" — a fetch of its own, since nothing else on this layout
    // reads the card list unconditionally.
    useEffect(() => {
        let gone = false;
        Api.decks.cards
            .list(deckUuid)
            .then(({ cards }) => {
                if (!gone) setHasProxies(cards.some((card) => card.proxy));
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [deckUuid]);

    /**
     * Records which bracket the deck claims
     *
     * @param bracket the bracket, `null` to leave it unsaid
     */
    async function saveBracket(bracket: number | null) {
        await Api.decks.setBracket(deckUuid, bracket);
        notify.success(t("toast.bracket-changed"));
        await router.invalidate();
    }

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
                                {/* Beside the format, because it is the same
                                    kind of statement about the deck — and the
                                    advisor, two tabs over, holds the deck to
                                    this number and to nothing else. */}
                                <DeckBracketPicker
                                    variant={"badge"}
                                    brackets={brackets}
                                    bracket={deck.bracket ?? null}
                                    onChange={(next) => void saveBracket(next)}
                                    className={ACTION_RING}
                                />
                                {/* Offered for every format, unlike the bracket
                                    beside it: a deck switched away from
                                    Commander keeps whatever its table agreed
                                    to, and a setting nothing can reach is a
                                    setting nobody can take back off. */}
                                <BadgeButton
                                    color={"zinc"}
                                    className={ACTION_RING}
                                    onClick={() => setEditingRuleZero(true)}
                                >
                                    <UserGroupIcon className={"size-3.5"} />
                                    {deviations === 0
                                        ? t("label.rule-zero")
                                        : t("label.rule-zero-count", { count: deviations })}
                                </BadgeButton>
                                {drifted > 0 && (
                                    <BadgeButton
                                        color={"amber"}
                                        className={ACTION_RING}
                                        onClick={() =>
                                            void navigate({
                                                to: "/decks/$deckUuid/sourcing",
                                                params: { deckUuid },
                                            })
                                        }
                                    >
                                        <ExclamationTriangleIcon className={"size-3.5"} />
                                        {t("label.drift", { count: drifted })}
                                    </BadgeButton>
                                )}
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
                                <DropdownItem
                                    onClick={() =>
                                        void navigate({
                                            to: "/game-utils/proxy-printer",
                                            search: { deck: deckUuid },
                                        })
                                    }
                                >
                                    <PrinterIcon />
                                    <DropdownLabel>{t("button.print-proxies")}</DropdownLabel>
                                    <DropdownDescription>{t("description.print-proxies")}</DropdownDescription>
                                </DropdownItem>
                                {hasProxies && (
                                    <DropdownItem
                                        onClick={() =>
                                            void navigate({
                                                to: "/game-utils/proxy-printer",
                                                search: { deck: deckUuid, proxies: true },
                                            })
                                        }
                                    >
                                        <DocumentDuplicateIcon />
                                        <DropdownLabel>{t("button.print-proxy-slots")}</DropdownLabel>
                                        <DropdownDescription>{t("description.print-proxy-slots")}</DropdownDescription>
                                    </DropdownItem>
                                )}
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
                            {/* Landing target for the fill-flight animation — see
                                fill-flight.tsx. Purely a lookup hook, no visual effect. */}
                            <Tab href={"/decks/$deckUuid/cards"} params={{ deckUuid }} data-deck-pile={true}>
                                {t("heading.cards")}
                            </Tab>
                            <Tab href={"/decks/$deckUuid/sourcing"} params={{ deckUuid }}>
                                {t("label.sourcing")}
                            </Tab>
                            <Tab href={"/decks/$deckUuid/statistics"} params={{ deckUuid }}>
                                {t("heading.statistics")}
                            </Tab>
                            {/* Opinions live behind their own tab, and only where
                                the graph has any: the advisor reads Commander. */}
                            {deck.format === "commander" && (
                                <Tab href={"/decks/$deckUuid/advisor"} params={{ deckUuid }}>
                                    {t("heading.advisor")}
                                </Tab>
                            )}
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

                {/* While the commander decides the colours, they arrive from
                    the on-demand fetch above; a claimed identity needs no
                    fetch, the deck itself carries it. */}
                <DeckRuleZeroDialog
                    open={editingRuleZero}
                    deck={deck}
                    colors={
                        deck.allowed_color_identity == null ? commanderIdentity : letters(deck.allowed_color_identity)
                    }
                    formatSize={rules?.deck_size.cards ?? null}
                    onClose={() => setEditingRuleZero(false)}
                    onSaved={() => router.invalidate()}
                />

                <DeckDialog
                    open={editing}
                    deck={deck}
                    formats={formats}
                    folders={folders}
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
                    onDeleted={() => {
                        // The advisor's per-deck preferences live on this device,
                        // keyed by uuid: nothing else would ever clear them.
                        forgetIgnored(deckUuid);
                        forgetThemePrefs(deckUuid);
                        forgetPoolQuery(deckUuid);
                        return navigate({ to: "/decks" });
                    }}
                />
            </div>
        </RequireAccount>
    );
}
