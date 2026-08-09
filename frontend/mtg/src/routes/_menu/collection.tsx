import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/collection")({
    component: RouteComponent,
});

function RouteComponent() {
    return <div>Hello "/_menu/collection"!</div>;
}
