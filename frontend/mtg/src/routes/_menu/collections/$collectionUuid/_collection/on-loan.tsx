import { createFileRoute } from "@tanstack/react-router";
import { Api } from "src/api/api";
import { CollectionOnLoan } from "src/components/collection-on-loan";

export const Route = createFileRoute("/_menu/collections/$collectionUuid/_collection/on-loan")({
    loader: ({ params }) => Api.collections.onLoan(params.collectionUuid),
    component: RouteComponent,
});

/**
 * The cards of this collection that are sleeved up in a deck right now.
 *
 * A page of its own rather than a strip above the card list: the list is what
 * the collection is opened for, and everything pushed above it is read once and
 * then in the way. Here there is room to group by deck and show the artwork.
 *
 * @returns the page
 */
function RouteComponent() {
    const { loans } = Route.useLoaderData();

    return <CollectionOnLoan loans={loans} />;
}
