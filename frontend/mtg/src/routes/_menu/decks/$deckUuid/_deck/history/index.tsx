import { createFileRoute } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { DeckHistoryList } from "src/components/deck-history-list";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/history/")({
    loader: ({ params }) => Api.decks.history(params.deckUuid),
    component: RouteComponent,
});

/**
 * The deck's Deck history, for its owner.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const firstPage = Route.useLoaderData();

    return <DeckHistoryList deckUuid={deckUuid} firstPage={firstPage} />;
}
