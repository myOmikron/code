import { createFileRoute } from "@tanstack/react-router";
import { LiveScanner } from "src/components/live-scanner";

export const Route = createFileRoute("/_collect/_scan/scan/live/$sessionUuid")({ component: LiveScannerSessionRoute });

/**
 * The camera, filling one named staging area.
 *
 * What a link to "scan into this box" is: the device follows the url rather than whatever it was
 * pointed at last, which is the only way handing the scanner over from a desk can be trusted.
 *
 * @returns the scanner
 */
function LiveScannerSessionRoute() {
    const { sessionUuid } = Route.useParams();
    return <LiveScanner session={sessionUuid} />;
}
