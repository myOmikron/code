import { Link, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDownTrayIcon, EyeSlashIcon, Square2StackIcon } from "@heroicons/react/20/solid";
import { Badge, BadgeButton, EmptyState, Tab, TabLayout, TabMenu, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CloneDeckDialog } from "src/components/clone-deck-dialog";
import { ExportDeckDialog } from "src/components/export-deck-dialog";
import { useDeckLabels } from "src/components/deck-labels";
import { useAccount } from "src/context/account";
import i18n from "src/i18n";
import { isNotPublic } from "src/utils/public-page";

/** How the mini buttons above the tabs are framed */
const ACTION_RING = "ring-1 ring-zinc-950/10 dark:ring-white/15";

export const Route = createFileRoute("/_menu/global/decks/$deckUuid/_deck")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces("deck");
        // The brackets come along so the claim can be named rather than
        // numbered; a failed read only costs the name.
        const offered = Api.decks.formats().catch(() => null);
        try {
            const [deck, formats] = await Promise.all([Api.explore.decks.get(params.deckUuid), offered, strings]);
            // Commander's own, so a deck in any other format is handed none —
            // see the owner's deck page, which does the same.
            const claims = formats?.formats.find((rules) => rules.slug === deck.format)?.has_brackets === true;
            return { deck, brackets: claims ? (formats?.brackets ?? []) : [] };
        } catch (error) {
            if (isNotPublic(error)) {
                await strings;
                return { deck: null, brackets: [] };
            }
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The chrome around a deck somebody put on show: whose it is and the tabs.
 *
 * The reader's half of the deck pages. Everything that builds a deck is
 * missing on purpose — what is offered instead is taking a copy of it.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { deck, brackets } = Route.useLoaderData();
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const navigate = useNavigate();
    const me = useAccount();
    const claimed = brackets.find((rules) => rules.number === deck?.bracket);
    const [exporting, setExporting] = useState(false);
    const [cloning, setCloning] = useState(false);

    if (deck === null) {
        return (
            <EmptyState
                icon={<EyeSlashIcon />}
                title={t("heading.deck-not-public")}
                description={t("description.deck-not-public")}
            />
        );
    }

    return (
        <div className={"flex flex-col gap-2"}>
            <TabLayout
                heading={deck.name}
                headingDescription={
                    <span className={"flex flex-col gap-2"}>
                        {deck.description != null && deck.description !== "" && <span>{deck.description}</span>}
                        <span className={"flex flex-wrap items-center gap-2"}>
                            <Badge color={"blue"}>{labels.format(deck.format)}</Badge>
                            {claimed !== undefined && (
                                <Badge color={"zinc"} title={t("label.bracket")}>
                                    {`B${claimed.number} · ${labels.bracket(claimed.slug)}`}
                                </Badge>
                            )}
                            <span>
                                {t("label.built-by")}{" "}
                                <Link
                                    to={"/global/profiles/$username"}
                                    params={{ username: deck.owner }}
                                    className={"font-medium hover:underline"}
                                >
                                    {deck.owner}
                                </Link>
                            </span>
                        </span>
                        <span className={"flex flex-wrap items-center gap-2"}>
                            <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setExporting(true)}>
                                <ArrowDownTrayIcon className={"size-3.5"} />
                                {t("button.export")}
                            </BadgeButton>
                            {me.account !== null && (
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setCloning(true)}>
                                    <Square2StackIcon className={"size-3.5"} />
                                    {t("button.clone-deck")}
                                </BadgeButton>
                            )}
                        </span>
                    </span>
                }
                tabs={
                    <TabMenu>
                        <Tab href={"/global/decks/$deckUuid/cards"} params={{ deckUuid }}>
                            {t("heading.cards")}
                        </Tab>
                        <Tab href={"/global/decks/$deckUuid/statistics"} params={{ deckUuid }}>
                            {t("heading.statistics")}
                        </Tab>
                    </TabMenu>
                }
            >
                <Outlet />
            </TabLayout>

            <ExportDeckDialog open={exporting} source={{ publicDeck: deckUuid }} onClose={() => setExporting(false)} />

            <CloneDeckDialog
                open={cloning}
                source={{ publicDeck: deckUuid }}
                name={deck.name}
                format={deck.format}
                description={deck.description}
                colors={deck.allowed_color_identity}
                onClose={() => setCloning(false)}
                onCloned={(created) => {
                    setCloning(false);
                    notify.success(t("toast.deck-cloned"));
                    void navigate({ to: "/decks/$deckUuid/cards", params: { deckUuid: created.uuid } });
                }}
            />
        </div>
    );
}
