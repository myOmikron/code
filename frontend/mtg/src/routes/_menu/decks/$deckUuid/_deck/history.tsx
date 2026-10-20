import { createFileRoute } from "@tanstack/react-router";
import { DeckHistoryList } from "src/components/deck-history-list";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/history")({
    component: RouteComponent,
});

/**
 * The deck's Deck history, for its owner.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();

    return <DeckHistoryList deckUuid={deckUuid} />;
}
