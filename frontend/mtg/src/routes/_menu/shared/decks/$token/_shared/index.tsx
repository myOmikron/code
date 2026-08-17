import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/shared/decks/$token/_shared/")({
    beforeLoad: ({ params }) => {
        throw redirect({ to: "/shared/decks/$token/cards", params, replace: true });
    },
});
