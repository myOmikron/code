import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_menu/game-utils")({
    component: RouteComponent,
});

/**
 * The section holding the tools used while a game is running.
 *
 * @returns whichever tool is open
 */
function RouteComponent() {
    return <Outlet />;
}
