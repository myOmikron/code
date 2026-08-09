import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/global/decks")({
    component: RouteComponent,
});

function RouteComponent() {
    return <div>Hello "/_menu/global/decks"!</div>;
}
