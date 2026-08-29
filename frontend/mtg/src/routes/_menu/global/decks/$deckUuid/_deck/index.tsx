import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/global/decks/$deckUuid/_deck/")({
    beforeLoad: ({ params }) => {
        throw redirect({ to: "/global/decks/$deckUuid/cards", params, replace: true });
    },
});
