import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { DeckCardGrid } from "src/components/deck-card-grid";
import { DeckCardList } from "src/components/deck-card-list";
import { useDeckLabels } from "src/components/deck-labels";
import { DECK_VIEWS, DeckViewControls } from "src/components/deck-view-controls";
import type { DeckView } from "src/components/deck-view-controls";
import { DECK_GROUPINGS, DECK_SORTS, groupDeck } from "src/utils/deck-grouping";
import type { DeckGrouping, DeckSort } from "src/utils/deck-grouping";
import { formatCurrency } from "src/utils/format";
import { resolvePrintings } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";
import { isDeadShareLink } from "src/utils/share-link";

/**
 * Search params of a shared deck's card list
 */
export type SharedDeckSearch = {
    /** What the list is broken up by */
    group?: DeckGrouping;
    /** What the cards inside a group are ordered by */
    sort?: DeckSort;
    /** How the cards are laid out */
    view?: DeckView;
    /** The slot whose dialog is open, by its id */
    card?: string;
};

export const Route = createFileRoute("/_menu/shared/decks/$token/_shared/cards")({
    validateSearch: (search: Record<string, unknown>): SharedDeckSearch => ({
        group: DECK_GROUPINGS.find((option) => option === search.group),
        sort: DECK_SORTS.find((option) => option === search.sort),
        view: DECK_VIEWS.find((option) => option === search.view),
        card: typeof search.card === "string" && search.card !== "" ? search.card : undefined,
    }),
    loader: async ({ params }) => {
        try {
            return { deck: await Api.shared.decks.cards(params.token) };
        } catch (error) {
            if (isDeadShareLink(error)) return { deck: null };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The cards of a shared deck, grouped as the reader wants them.
 *
 * @returns the page
 */
function RouteComponent() {
    const { token } = Route.useParams();
    const { deck } = Route.useLoaderData();
    const search = Route.useSearch();
    const navigate = useNavigate();
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();
    const [inspected, setInspected] = useState<Printing | null>(null);

    const cards = deck?.cards ?? [];
    const tags = deck?.tags ?? [];
    const grouping = search.group ?? "type";
    const sort = search.sort ?? "name";
    const view = search.view ?? "grid";
    const groups = groupDeck(cards, grouping, sort, tags);
    const inspecting = search.card === undefined ? null : (cards.find((card) => card.uuid === search.card) ?? null);

    /**
     * Writes new search params, keeping the ones not mentioned
     *
     * @param next what to change
     */
    function go(next: Partial<SharedDeckSearch>) {
        void navigate({
            to: "/shared/decks/$token/cards",
            params: { token },
            search: { ...search, ...next },
            resetScroll: false,
        });
    }

    useEffect(() => {
        if (inspecting === null) {
            setInspected(null);
            return;
        }
        let dropped = false;
        const printing = inspecting.printing;
        void resolvePrintings([printing]).then((found) => {
            if (!dropped) setInspected(found.get(printing) ?? null);
        });
        return () => {
            dropped = true;
        };
    }, [inspecting]);

    if (cards.length === 0) {
        return <EmptyState title={t("heading.no-cards")} description={t("description.shared-empty")} />;
    }

    return (
        <div className={"flex flex-col gap-4"}>
            <div className={"flex items-center justify-end"}>
                <DeckViewControls
                    view={view}
                    grouping={grouping}
                    sort={sort}
                    onChangeView={(next) => go({ view: next === "grid" ? undefined : next })}
                    onChangeGrouping={(next) => go({ group: next === "type" ? undefined : next })}
                    onChangeSort={(next) => go({ sort: next === "name" ? undefined : next })}
                />
            </div>

            {view === "grid" ? (
                <DeckCardGrid
                    groups={groups}
                    grouping={grouping}
                    violations={new Map()}
                    tags={tags}
                    onInspect={(card) => go({ card: card.uuid })}
                />
            ) : (
                <DeckCardList
                    groups={groups}
                    grouping={grouping}
                    violations={new Map()}
                    tags={tags}
                    onInspect={(card) => go({ card: card.uuid })}
                />
            )}

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
