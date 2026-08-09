import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/profile/_profile/settings")({
    component: RouteComponent,
});

function RouteComponent() {
    return <div>Hello "/_menu/profile/_profile/settings"!</div>;
}
