import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CardIndexProvider } from "src/context/card-index-context";
import { ScanScopeProvider } from "src/context/scan-scope-context";

export const Route = createFileRoute("/_collect/scan")({ component: ScanLayoutRoute });

/**
 * Layout for the whole scan path.
 *
 * The card index is loaded here, not further up: it downloads a 75 MB routing table that no
 * screen outside the scanner uses. Staying mounted across `/scan` → `/scan/live` keeps the
 * load from restarting mid-flow.
 *
 * The list screen's printing picker works without it — that lookup loads what it needs inside
 * the scan worker (see `listPrintingsByName`).
 *
 * @returns the scan section
 */
function ScanLayoutRoute() {
    return (
        <CardIndexProvider>
            <ScanScopeProvider>
                <Outlet />
            </ScanScopeProvider>
        </CardIndexProvider>
    );
}
