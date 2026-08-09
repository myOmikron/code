import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/watch-lists")({
    component: RouteComponent,
});

function RouteComponent() {
    return <div>Hello "/_menu/watch-lists"!</div>;
}
