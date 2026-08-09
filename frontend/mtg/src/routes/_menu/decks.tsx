import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/decks")({
    component: RouteComponent,
});

function RouteComponent() {
    return <div>Hello "/_menu/decks"!</div>;
}
