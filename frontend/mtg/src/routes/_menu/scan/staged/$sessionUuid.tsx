import { createFileRoute } from "@tanstack/react-router";
import { StagedSession } from "src/components/staged-session";

export const Route = createFileRoute("/_menu/scan/staged/$sessionUuid")({ component: StagedSessionRoute });

/**
 * One named staging area.
 *
 * A session is a box on a table and a box can be handed over: this url opens that box on whatever
 * device follows the link, and switches that device to filling it.
 *
 * @returns the page
 */
function StagedSessionRoute() {
    const { sessionUuid } = Route.useParams();
    return <StagedSession session={sessionUuid} />;
}
