import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_collect")({ component: CollectLayoutRoute });

/**
 * Layout for the one screen that is not a page: the running camera.
 *
 * Pathless, so the url stays `/scan/live`. Everything else about scanning — the way in, and the
 * staged cards — lives under `_menu` and wears the app's chrome like any other section; what is
 * left here is the viewfinder, which wants the whole screen and no navbar over it.
 *
 * @returns the scanner section
 */
function CollectLayoutRoute() {
    return <Outlet />;
}
