import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/")({
    beforeLoad: ({ params }) => {
        throw redirect({ to: "/tournaments/$tournamentUuid/overview", params, replace: true });
    },
});
