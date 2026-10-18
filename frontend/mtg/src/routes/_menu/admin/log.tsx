import { createFileRoute } from "@tanstack/react-router";
import { AdminLogEntries } from "src/components/admin-log-entries";

export const Route = createFileRoute("/_menu/admin/log")({
    component: RouteComponent,
});

/**
 * The Admin log: every Lock, unlock, Role change and Deletion, newest first.
 *
 * @returns the page
 */
function RouteComponent() {
    return <AdminLogEntries />;
}
