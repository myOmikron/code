import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/global/collections/$collectionUuid/_collection/")({
    beforeLoad: ({ params }) => {
        throw redirect({ to: "/global/collections/$collectionUuid/cards", params, replace: true });
    },
});
