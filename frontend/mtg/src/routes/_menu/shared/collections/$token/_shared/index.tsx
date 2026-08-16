import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/shared/collections/$token/_shared/")({
    beforeLoad: ({ params }) => {
        throw redirect({ to: "/shared/collections/$token/cards", params, replace: true });
    },
});
