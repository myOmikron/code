import { createFileRoute } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { DeckPointView } from "src/components/deck-point-view";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/history/$changeUuid")({
    loader: ({ params }) => Api.decks.point(params.deckUuid, params.changeUuid),
    component: RouteComponent,
});

/**
 * The deck as it was right after one of its Deck changes, for its owner.
 *
 * @returns the page
 */
function RouteComponent() {
    const { deckUuid } = Route.useParams();
    const point = Route.useLoaderData();

    return <DeckPointView deckUuid={deckUuid} point={point} />;
}
