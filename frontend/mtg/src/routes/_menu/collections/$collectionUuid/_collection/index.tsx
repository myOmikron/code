import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/collections/$collectionUuid/_collection/")({
    // The cards are what a collection is, so opening one lands on them. Kept as
    // a redirect rather than by mounting the list here as well, so the tab that
    // is highlighted always matches the url — and so every link that predates
    // the split keeps working.
    beforeLoad: ({ params }) => {
        throw redirect({ to: "/collections/$collectionUuid/cards", params, replace: true });
    },
});
