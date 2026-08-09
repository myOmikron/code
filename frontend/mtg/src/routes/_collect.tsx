import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PendingScansProvider } from "src/context/pending-scans-context";

export const Route = createFileRoute("/_collect")({ component: CollectLayoutRoute });

/**
 * Layout for the flow that gets cards into the collection: scanning and the staging list.
 *
 * Pathless, so the urls stay `/scan`, `/scan/live` and `/liste`. Exists to give the staged
 * scans a common ancestor — the scanner fills the list, the review screen empties it.
 *
 * @returns the collect section
 */
function CollectLayoutRoute() {
    return (
        <PendingScansProvider>
            <Outlet />
        </PendingScansProvider>
    );
}
