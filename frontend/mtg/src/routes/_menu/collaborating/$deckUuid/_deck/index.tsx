import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/collaborating/$deckUuid/_deck/")({
    beforeLoad: ({ params }) => {
        throw redirect({ to: "/collaborating/$deckUuid/cards", params, replace: true });
    },
});
