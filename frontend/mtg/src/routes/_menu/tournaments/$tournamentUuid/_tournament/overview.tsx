import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { Badge, DescriptionDetails, DescriptionList, DescriptionTerm, Text } from "components";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { ResponseError } from "src/api/generated";
import type { TournamentParticipantResponse } from "src/api/generated";
import {
    TournamentJoinCode,
    tournamentStatusColor,
    tournamentStatusLabelKey,
} from "src/components/tournament-join-code";
import { formatDateTime } from "src/utils/format";

export const Route = createFileRoute("/_menu/tournaments/$tournamentUuid/_tournament/overview")({
    loader: async ({ params }) => {
        try {
            return await Api.tournaments.participants.list(params.tournamentUuid);
        } catch (error) {
            // The layout above already proved the viewer may see this tournament; a failure here
            // is a very short-lived race at worst, and simply shows a roster of nobody.
            if (error instanceof ResponseError) return { participants: [] as Array<TournamentParticipantResponse> };
            throw error;
        }
    },
    component: RouteComponent,
});

/**
 * The M1 summary of a tournament: where it stands, when and where it happens, and how many are
 * on the roster — plus the join-code card, for whoever runs it.
 *
 * @returns the page
 */
function RouteComponent() {
    const { tournamentUuid } = Route.useParams();
    const { participants } = Route.useLoaderData();
    // Non-null: the layout only ever renders `<Outlet />` — reaching this tab at all — once its
    // own loader resolved a tournament; a `null` there renders the layout's own empty state
    // instead, and this component never mounts.
    const { tournament, viewer } = useLoaderData({ from: "/_menu/tournaments/$tournamentUuid/_tournament" })!;
    const [t] = useTranslation("tournament");
    const router = useRouter();

    return (
        <div className={"flex flex-col gap-6"}>
            <DescriptionList>
                <DescriptionTerm>{t("label.status")}</DescriptionTerm>
                <DescriptionDetails>
                    <Badge color={tournamentStatusColor(tournament.status)}>
                        {t(tournamentStatusLabelKey(tournament.status))}
                    </Badge>
                </DescriptionDetails>

                <DescriptionTerm>{t("label.starts-at")}</DescriptionTerm>
                <DescriptionDetails>
                    {tournament.starts_at != null ? formatDateTime(tournament.starts_at) : "—"}
                </DescriptionDetails>

                <DescriptionTerm>{t("label.venue")}</DescriptionTerm>
                <DescriptionDetails>
                    {tournament.venue != null && tournament.venue !== "" ? tournament.venue : "—"}
                </DescriptionDetails>

                <DescriptionTerm>{t("heading.players")}</DescriptionTerm>
                <DescriptionDetails>{t("label.players", { count: participants.length })}</DescriptionDetails>
            </DescriptionList>

            {tournament.description != null && tournament.description !== "" && <Text>{tournament.description}</Text>}

            {viewer.is_organizer && (
                <TournamentJoinCode
                    tournamentUuid={tournamentUuid}
                    joinCode={tournament.join_code}
                    mayManage={viewer.may_manage}
                    onChanged={() => router.invalidate()}
                />
            )}
        </div>
    );
}
