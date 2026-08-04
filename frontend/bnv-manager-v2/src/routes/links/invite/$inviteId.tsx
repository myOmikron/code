import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Props for {@link LinkInvite}
 */
type LinkInviteProps = {};

/**
 * Link to the invite page
 */
function LinkInvite(props: LinkInviteProps) {
    const { inviteId } = Route.useParams();

    return <Navigate to={"/invites/$inviteId"} params={{ inviteId }} />;
}

export const Route = createFileRoute("/links/invite/$inviteId")({
    component: LinkInvite,
});
