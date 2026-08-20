import { Link, Outlet, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    LinkIcon,
    PencilSquareIcon,
    TrashIcon,
} from "@heroicons/react/20/solid";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Badge,
    BadgeButton,
    Button,
    Dropdown,
    DropdownButton,
    DropdownDescription,
    DropdownDivider,
    DropdownItem,
    DropdownLabel,
    DropdownMenu,
    Tab,
    TabLayout,
    TabMenu,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckDialog } from "src/components/deck-dialog";
import { ExportDeckDialog } from "src/components/export-deck-dialog";
import { ImportDeckDialog } from "src/components/import-deck-dialog";
import { useDeckLabels } from "src/components/deck-labels";
import { RequireAccount } from "src/components/require-account";
import { ShareDialog } from "src/components/share-dialog";
import { deckShareTarget } from "src/utils/share-targets";
import { forgetIgnored } from "src/utils/deck-ignore";
import { forgetSpeedOverride } from "src/utils/deck-speed";

/** How the mini buttons above the tabs are framed */
const ACTION_RING = "ring-1 ring-zinc-950/10 dark:ring-white/15";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck")({
    loader: async ({ params }) => {
        const [deck, offered] = await Promise.all([Api.decks.get(params.deckUuid), Api.decks.formats()]);
        return { deck, formats: offered.formats, brackets: offered.brackets };
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
    const { deck, formats } = Route.useLoaderData();
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const labels = useDeckLabels();
    const router = useRouter();
    const navigate = useNavigate();
    const [sharing, setSharing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [editing, setEditing] = useState(false);
    const [confirming, setConfirming] = useState(false);

    /**
     * Deletes the deck and leaves for the list it was in
     */
    async function remove() {
        setConfirming(false);
        await Api.decks.delete(deckUuid);
        // The advisor's per-deck preferences live on this device, keyed by
        // uuid: nothing else would ever clear them.
        forgetIgnored(deckUuid);
        forgetSpeedOverride(deckUuid);
        notify.success(t("toast.deck-deleted"));
        await navigate({ to: "/decks" });
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

                <ExportDeckDialog open={exporting} deckUuid={deckUuid} onClose={() => setExporting(false)} />

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

                <Alert open={confirming} onClose={() => setConfirming(false)}>
                    <AlertTitle>{t("heading.delete-deck")}</AlertTitle>
                    <AlertDescription>{t("description.delete-deck", { name: deck.name })}</AlertDescription>
                    <AlertActions>
                        <Button plain onClick={() => setConfirming(false)}>
                            {tg("button.cancel")}
                        </Button>
                        <Button color={"red"} onClick={() => void remove()}>
                            {t("button.delete-deck")}
                        </Button>
                    </AlertActions>
                </Alert>
            </div>
        </RequireAccount>
    );
}
