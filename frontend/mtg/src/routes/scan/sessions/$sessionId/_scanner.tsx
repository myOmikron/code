import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { CardIndexProvider } from "src/context/card-index-context";
import { ScanScopeProvider } from "src/context/scan-scope-context";
import { useScanSessions } from "src/context/scan-sessions-context";

export const Route = createFileRoute("/scan/sessions/$sessionId/_scanner")({ component: ScannerLayoutRoute });

/**
 * Layout for the scanning screens of a session: the scope picker and the camera.
 *
 * Chrome-less on purpose — the camera wants the whole screen, especially on a phone. It also
 * guards the session id: a stale link goes back to the overview.
 *
 * The card index is loaded here, not further up: it downloads a routing table weighing tens of
 * megabytes (more, with every language indexed) that neither the session overview nor the review
 * uses. Staying mounted across scope → live keeps the load from restarting mid-flow.
 *
 * The review's printing picker works without it — that lookup loads what it needs inside the scan
 * worker (see `listPrintingsByName`).
 *
 * @returns the scanning screens, or the redirect
 */
function ScannerLayoutRoute() {
    const { sessionId } = Route.useParams();
    const { sessions } = useScanSessions();
    if (!sessions.some((session) => session.id === sessionId)) return <Navigate to="/scan" replace />;
    return (
        <CardIndexProvider>
            <ScanScopeProvider>
                <Outlet />
            </ScanScopeProvider>
        </CardIndexProvider>
    );
}
