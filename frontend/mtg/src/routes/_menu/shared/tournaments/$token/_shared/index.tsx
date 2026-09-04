import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { Badge, DescriptionDetails, DescriptionList, DescriptionTerm, Text } from "components";
import { useTranslation } from "react-i18next";
import { tournamentStatusColor, tournamentStatusLabelKey } from "src/components/tournament-join-code";
import { formatDateTime } from "src/utils/format";

export const Route = createFileRoute("/_menu/shared/tournaments/$token/_shared/")({
    component: RouteComponent,
});

/**
 * The public overview of a shared tournament: where it stands, when and where it happens, and how
 * many are on the roster.
 *
 * The same shape as the authed overview tab's `DescriptionList`, minus everything that page keeps
 * for staff and players only — the join-code card and the viewer's own decklist card both have no
 * equivalent here, this section has no viewer with a role at all.
 *
 * @returns the page
 */
function RouteComponent() {
    // Non-null: the layout only ever renders `<Outlet />` — reaching this tab at all — once its
    // own loader resolved a tournament; a dead link renders the layout's own empty state instead,
    // and this component never mounts.
    const tournament = useLoaderData({ from: "/_menu/shared/tournaments/$token/_shared" }).tournament!;
    const [t] = useTranslation("tournament");

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
                <DescriptionDetails>{t("label.players", { count: tournament.participant_count })}</DescriptionDetails>
            </DescriptionList>

            {tournament.description != null && tournament.description !== "" && <Text>{tournament.description}</Text>}
        </div>
    );
}
