import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ScanScopeProvider } from "src/context/scan-scope-context";

export const Route = createFileRoute("/_collect/_scan")({ component: ScanLayoutRoute });

/**
 * Pathless layout for the standalone live scanner.
 *
 * Only the chosen sets are held here now. The catalogue the scanner searches is loaded by the
 * scanner itself, and the printing picker reads its list from that same catalogue rather than
 * from the separate routing table this layout used to download.
 *
 * @returns the scan section
 */
function ScanLayoutRoute() {
    return (
        <ScanScopeProvider>
            <Outlet />
        </ScanScopeProvider>
    );
}
