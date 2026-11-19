import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/decks/$deckUuid/_deck/sourcing")({
    beforeLoad: ({ params }) => {
        throw redirect({ to: "/decks/$deckUuid/cards", params, search: { physical: true }, replace: true });
    },
});
