import { createFileRoute } from "@tanstack/react-router";
import { LiveScanner } from "src/components/live-scanner";

export const Route = createFileRoute("/_collect/_scan/scan/live/")({ component: LiveScannerRoute });

/**
 * The camera, filling whichever staging area this device is on
 *
 * @returns the scanner
 */
function LiveScannerRoute() {
    return <LiveScanner />;
}
