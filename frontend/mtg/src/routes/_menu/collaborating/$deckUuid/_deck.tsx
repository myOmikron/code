import { Link, Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
    ArrowDownTrayIcon,
    ArrowRightStartOnRectangleIcon,
    ChevronLeftIcon,
    EyeSlashIcon,
    UsersIcon,
} from "@heroicons/react/20/solid";
import { Badge, BadgeButton, EmptyState, Tab, TabLayout, TabMenu } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeckLeaveDialog } from "src/components/deck-leave-dialog";
import { ExportDeckDialog } from "src/components/export-deck-dialog";
import { useDeckLabels } from "src/components/deck-labels";
import { RequireAccount } from "src/components/require-account";
import { ShareDialog } from "src/components/share-dialog";
import i18n from "src/i18n";
import { deckCardsRoute } from "src/utils/deck-rights";

/** How the mini buttons above the tabs are framed */
const ACTION_RING = "ring-1 ring-zinc-950/10 dark:ring-white/15";

export const Route = createFileRoute("/_menu/collaborating/$deckUuid/_deck")({
    loader: async ({ params }) => {
        const strings = i18n.loadNamespaces("deck");
        const offered = Api.decks.formats().catch(() => null);
        const [deck, formats] = await Promise.all([Api.decks.getIfThere(params.deckUuid), offered, strings]);
        const cards = deckCardsRoute(deck?.role);
        if (cards !== "/collaborating/$deckUuid/cards") {
            throw redirect({ to: cards, params, replace: true });
        }
        const claims =
            deck !== null && formats?.formats.find((rules) => rules.slug === deck.format)?.has_brackets === true;
        return { deck, brackets: claims ? (formats?.brackets ?? []) : [] };
    },
    component: RouteComponent,
});

/**
 * The chrome around a deck its owner named the reader on: what it is and the tabs.
 *
 * @returns the tabbed frame around the current tab
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { deck, brackets } = Route.useLoaderData();
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const claimed = brackets.find((rules) => rules.number === deck?.bracket);
    const [exporting, setExporting] = useState(false);
    const [listing, setListing] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const navigate = useNavigate();

    if (deck === null) {
        return (
            <RequireAccount>
                <EmptyState
                    icon={<EyeSlashIcon />}
                    title={t("heading.deck-not-shared")}
                    description={t("description.deck-not-shared")}
                />
            </RequireAccount>
        );
    }

    return (
        <RequireAccount>
            <div className={"flex flex-col gap-2"}>
                <Link
                    to={"/decks"}
                    className={
                        "flex items-center gap-1 text-sm text-zinc-500 hover:text-(--color-accent) hover:underline dark:text-zinc-400"
                    }
                >
                    <ChevronLeftIcon className={"size-4"} /> {t("button.back-to-decks")}
                </Link>
                <TabLayout
                    heading={deck.name}
                    headingDescription={
                        <span className={"flex flex-col gap-2"}>
                            {deck.description != null && deck.description !== "" && <span>{deck.description}</span>}
                            <span className={"flex flex-wrap items-center gap-2"}>
                                <Badge color={"lime"}>{labels.format(deck.format)}</Badge>
                                {claimed !== undefined && (
                                    <Badge color={"zinc"} title={t("label.bracket")}>
                                        {`B${claimed.number} · ${labels.bracket(claimed.slug)}`}
                                    </Badge>
                                )}
                                <span>{t("label.collaborating-read-only")}</span>
                            </span>
                            <span className={"flex flex-wrap items-center gap-2"}>
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setExporting(true)}>
                                    <ArrowDownTrayIcon className={"size-3.5"} />
                                    {t("button.export")}
                                </BadgeButton>
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setListing(true)}>
                                    <UsersIcon className={"size-3.5"} />
                                    {t("button.people")}
                                </BadgeButton>
                                <BadgeButton color={"zinc"} className={ACTION_RING} onClick={() => setLeaving(true)}>
                                    <ArrowRightStartOnRectangleIcon className={"size-3.5"} />
                                    {t("button.leave-deck")}
                                </BadgeButton>
                            </span>
                        </span>
                    }
                    tabs={
                        <TabMenu>
                            <Tab href={"/collaborating/$deckUuid/cards"} params={{ deckUuid }}>
                                {t("heading.cards")}
                            </Tab>
                            <Tab href={"/collaborating/$deckUuid/statistics"} params={{ deckUuid }}>
                                {t("heading.statistics")}
                            </Tab>
                        </TabMenu>
                    }
                >
                    <Outlet />
                </TabLayout>

                <ExportDeckDialog open={exporting} source={{ deckUuid }} onClose={() => setExporting(false)} />

                <ShareDialog
                    subject={
                        listing
                            ? {
                                  kind: "decks",
                                  uuid: deckUuid,
                                  visibility: deck.visibility,
                                  shareToken: null,
                                  owner: false,
                              }
                            : null
                    }
                    linkDescription={t("description.share-link")}
                    onClose={() => setListing(false)}
                    onChanged={() => undefined}
                    onLeave={() => {
                        setListing(false);
                        setLeaving(true);
                    }}
                />

                <DeckLeaveDialog
                    deck={leaving ? { uuid: deckUuid, name: deck.name } : null}
                    onClose={() => setLeaving(false)}
                    onLeft={() => navigate({ to: "/decks" })}
                />
            </div>
        </RequireAccount>
    );
}
