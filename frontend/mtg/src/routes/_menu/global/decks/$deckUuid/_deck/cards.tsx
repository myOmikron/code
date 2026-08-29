import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { DeckCardGrid } from "src/components/deck-card-grid";
import { DeckCardPreview } from "src/components/deck-card-preview";
import { DeckCardList } from "src/components/deck-card-list";
import { DeckCardTable } from "src/components/deck-card-table";
import { useDeckLabels } from "src/components/deck-labels";
import { DECK_TILE_SIZES, DECK_VIEWS, DeckViewControls } from "src/components/deck-view-controls";
import type { DeckTileSize, DeckView } from "src/components/deck-view-controls";
import { DECK_GROUPINGS, DECK_SORTS, groupDeck } from "src/utils/deck-grouping";
import { useCollapsedGroups } from "src/utils/use-collapsed-groups";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import { formatCurrency } from "src/utils/format";
import { resolvePrintings } from "src/utils/scryfall";
import { provisionalPrinting } from "src/utils/provisional-printing";
import type { Printing } from "src/utils/scryfall";
import { isNotPublic } from "src/utils/public-page";
import { useAccount } from "src/context/account";
import { useDeckViewSettings } from "src/utils/deck-view-settings";
import { useFlippedCards } from "src/utils/use-flipped-cards";

/**
 * Search params of a public deck's card list
 */
export type PublicDeckSearch = {
    /** What the list is broken up by */
    group?: DeckGrouping;
    /** What the cards inside a group are ordered by */
    sort?: DeckSort;
    /** How the cards are laid out */
    view?: DeckView;
    /** How big the cards are drawn */
    size?: DeckTileSize;
    /** The slot whose dialog is open, by its id */
    card?: string;
};

export const Route = createFileRoute("/_menu/global/decks/$deckUuid/_deck/cards")({
    validateSearch: (search: Record<string, unknown>): PublicDeckSearch => ({
        group: DECK_GROUPINGS.find((option) => option === search.group),
        sort: DECK_SORTS.find((option) => option === search.sort),
        view: DECK_VIEWS.find((option) => option === search.view),
        size: DECK_TILE_SIZES.find((option) => option === search.size),
        card: typeof search.card === "string" && search.card !== "" ? search.card : undefined,
    }),
    loader: async ({ params }) => {
        try {
            return { deck: await Api.explore.decks.cards(params.deckUuid) };
        } catch (error) {
            if (isNotPublic(error)) return { deck: null };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The cards of a deck somebody put on show, grouped as the reader wants them.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const { deck } = Route.useLoaderData();
    const search = Route.useSearch();
    const navigate = useNavigate();
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const { account } = useAccount();
    const [viewSettings, setViewSettings] = useDeckViewSettings(account?.uuid ?? null);
    const flippedCards = useFlippedCards();
    const [inspected, setInspected] = useState<Printing | null>(null);
    const [active, setActive] = useState<string | null>(null);

    const cards = deck?.cards ?? [];
    const tags = deck?.tags ?? [];
    const grouping = search.group ?? "type";
    const sort = search.sort ?? viewSettings.sort;
    const view = search.view ?? viewSettings.view;
    const size = search.size ?? viewSettings.size;
    const groups = groupDeck(cards, grouping, sort, tags);
    const collapsedGroups = useCollapsedGroups(deckUuid);
    const inspecting = search.card === undefined ? null : (cards.find((card) => card.uuid === search.card) ?? null);
    const previewed =
        search.card === undefined
            ? (cards.find((slot) => slot.uuid === active) ?? cards.find((slot) => slot.zone === "Commander") ?? null)
            : null;

    /**
     * Writes new search params, keeping the ones not mentioned
     *
     * @param next what to change
     */
    function go(next: Partial<PublicDeckSearch>) {
        void navigate({
            to: "/global/decks/$deckUuid/cards",
            params: { deckUuid },
            search: { ...search, ...next },
            resetScroll: false,
        });
    }

    /**
     * Persists and applies a different card layout
     *
     * @param next the selected layout
     */
    function changeView(next: DeckView) {
        setViewSettings({ sort, size, view: next });
        go({ view: next === "grid" ? undefined : next });
    }

    /**
     * Persists and applies a different grid tile size
     *
     * @param next the selected tile size
     */
    function changeSize(next: DeckTileSize) {
        setViewSettings({ sort, size: next, view });
        go({ size: next === "m" ? undefined : next });
    }

    /**
     * Persists and applies a different order within groups
     *
     * @param next the selected order
     */
    function changeSort(next: DeckSort) {
        setViewSettings({ sort: next, size, view });
        go({ sort: next === "name" ? undefined : next });
    }

    // Opened on what the listing already carries and upgraded when Scryfall's
    // own record lands, see `provisionalPrinting`: the dialog opens on
    // `printing !== null`, so waiting for the lookup meant a click that did
    // nothing until the slowest of memory, disk and network answered.
    useEffect(() => {
        if (inspecting === null) {
            setInspected(null);
            return;
        }
        let dropped = false;
        const printing = inspecting.printing;
        setInspected(inspecting.card == null ? null : provisionalPrinting(printing, inspecting.card));
        void resolvePrintings([printing]).then((resolved) => {
            const found = resolved.get(printing);
            if (!dropped && found !== undefined) setInspected(found);
        });
        return () => {
            dropped = true;
        };
    }, [inspecting]);

    if (cards.length === 0) {
        return <EmptyState title={t("heading.no-cards")} description={t("description.deck-not-public")} />;
    }

    return (
        <div className={"flex flex-col gap-4"}>
            <div className={"flex items-center justify-end"}>
                <DeckViewControls
                    view={view}
                    size={size}
                    onChangeSize={changeSize}
                    grouping={grouping}
                    sort={sort}
                    onChangeView={changeView}
                    onChangeGrouping={(next) => go({ group: next === "type" ? undefined : next })}
                    onChangeSort={changeSort}
                />
            </div>

            <div className={"flex items-start gap-6"}>
                <aside className={"sticky top-6 hidden w-72 shrink-0 xl:block 2xl:w-80"}>
                    <DeckCardPreview
                        card={search.card === undefined ? (cards.find((slot) => slot.uuid === active) ?? null) : null}
                        commander={
                            search.card === undefined ? (cards.find((slot) => slot.zone === "Commander") ?? null) : null
                        }
                        tags={tags}
                        flipped={previewed !== null && flippedCards.isFlipped(previewed.uuid)}
                    />
                </aside>

                <div className={"min-w-0 flex-1"}>
                    {view === "grid" ? (
                        <DeckCardGrid
                            size={size}
                            groups={groups}
                            grouping={grouping}
                            violations={new Map()}
                            tags={tags}
                            onInspect={(card) => go({ card: card.uuid })}
                            onActivate={(card) => setActive(card?.uuid ?? null)}
                            isFlipped={(card) => flippedCards.isFlipped(card.uuid)}
                            onFlip={(card) => flippedCards.toggle(card.uuid)}
                            isCollapsed={collapsedGroups.isCollapsed}
                            onToggleGroup={collapsedGroups.toggle}
                        />
                    ) : view === "list" ? (
                        <DeckCardList
                            groups={groups}
                            grouping={grouping}
                            violations={new Map()}
                            tags={tags}
                            onInspect={(card) => go({ card: card.uuid })}
                            onActivate={(card) => setActive(card?.uuid ?? null)}
                            isFlipped={(card) => flippedCards.isFlipped(card.uuid)}
                            onFlip={(card) => flippedCards.toggle(card.uuid)}
                            isCollapsed={collapsedGroups.isCollapsed}
                            onToggleGroup={collapsedGroups.toggle}
                        />
                    ) : (
                        <DeckCardTable
                            groups={groups}
                            grouping={grouping}
                            violations={new Map()}
                            tags={tags}
                            onInspect={(card) => go({ card: card.uuid })}
                            onActivate={(card) => setActive(card?.uuid ?? null)}
                            isFlipped={(card) => flippedCards.isFlipped(card.uuid)}
                            onFlip={(card) => flippedCards.toggle(card.uuid)}
                            isCollapsed={collapsedGroups.isCollapsed}
                            onToggleGroup={collapsedGroups.toggle}
                        />
                    )}
                </div>
            </div>

            <CardDetailDialog
                printing={inspected}
                market={inspecting?.card ?? null}
                details={
                    inspecting === null
                        ? []
                        : [
                              { label: t("label.quantity"), value: inspecting.quantity },
                              { label: t("label.zone"), value: labels.zone(inspecting.zone) },
                              ...(inspecting.card?.price_eur_cents == null
                                  ? []
                                  : [
                                        {
                                            label: t("label.value"),
                                            value: formatCurrency(
                                                (inspecting.card.price_eur_cents * inspecting.quantity) / 100,
                                            ),
                                        },
                                    ]),
                          ]
                }
                onClose={() => go({ card: undefined })}
            />
        </div>
    );
}
