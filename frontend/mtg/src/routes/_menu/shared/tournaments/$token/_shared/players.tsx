import { createFileRoute } from "@tanstack/react-router";
import { Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import type { SharedParticipantResponse } from "src/api/generated";
import { participantStatusColor, participantStatusLabelKey } from "src/components/tournament-join-code";

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/players")({
    loader: async ({ params }) => {
        try {
            return await Api.shared.tournaments.participants(params.token);
        } catch (error) {
            // The layout above already resolved this token to a tournament whose roster view
            // allows a players tab at all (`roster_available`), same as `overview.tsx`'s own
            // loader shrugging off a short-lived race on the authed roster. It is also exactly
            // how a roster that turned `Hidden` between the two requests answers — deliberately
            // indistinguishable from a dead token, see `roster_view`'s own doc comment — so
            // there is no case here worth telling apart from an honest empty roster.
            if (error instanceof ResponseError) return { participants: [] as Array<SharedParticipantResponse> };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The redacted roster of a tournament somebody shared: name and status, nothing else.
 *
 * No uuids, no decklists, no actions — a guest row already arrives under its real name or a
 * pseudonym depending on the event's roster view; this page renders whatever it was handed
 * without an opinion of its own.
 *
 * @returns the page
 */
function RouteComponent() {
    const { participants } = Route.useLoaderData();
    const [t] = useTranslation("tournament");

    if (participants.length === 0) {
        return <EmptyState title={t("label.no-players")} />;
    }

    return (
        <Table dense={true} striped={true}>
            <TableHead>
                <TableRow>
                    <TableHeader>{t("label.name")}</TableHeader>
                    <TableHeader>{t("label.status")}</TableHeader>
                </TableRow>
            </TableHead>
            <TableBody>
                {participants.map((participant, index) => (
                    <TableRow key={index}>
                        <TableCell>{participant.display_name}</TableCell>
                        <TableCell>
                            <Badge color={participantStatusColor(participant.status)}>
                                {t(participantStatusLabelKey(participant.status))}
                            </Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
