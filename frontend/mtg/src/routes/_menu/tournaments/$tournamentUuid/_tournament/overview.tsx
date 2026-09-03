import { createFileRoute, useLoaderData, useRouter } from "@tanstack/react-router";
import { Badge, Button, Description, DescriptionDetails, DescriptionList, DescriptionTerm, Text } from "components";
import type { BadgeProps } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DecklistPolicy, ResponseError } from "src/api/generated";
import type { TournamentParticipantResponse } from "src/api/generated";
import { DecklistDialog } from "src/components/decklist-dialog";
import {
    TournamentJoinCode,
    tournamentStatusColor,
    tournamentStatusLabelKey,
} from "src/components/tournament-join-code";
import { useAccount } from "src/context/account";
import { formatDateTime } from "src/utils/format";

/** The colour union {@link Badge} accepts, without the `undefined` a plain lookup would carry */
type BadgeColor = NonNullable<BadgeProps["color"]>;

/**
 * The colour a participant's decklist status badge reads best in
 *
 * Green once one is on file; missing only reads as a mere zinc note under
 * {@link DecklistPolicy.Optional} — it escalates to red once the tournament actually requires one.
 *
 * @param hasDecklist whether the participant has a decklist on file
 * @param policy the tournament's decklist policy
 *
 * @returns the badge colour
 */
function decklistBadgeColor(hasDecklist: boolean, policy: DecklistPolicy): BadgeColor {
    if (hasDecklist) return "green";
    return policy === DecklistPolicy.Optional ? "zinc" : "red";
}

/**
 * The translation key for the reminder shown under the policy, `null` under
 * {@link DecklistPolicy.Optional} which asks nothing extra of a registered player.
 *
 * @param policy the tournament's decklist policy
 *
 * @returns the `tournament` namespace key, or `null`
 */
function decklistPolicyHintKey(policy: DecklistPolicy): string | null {
    switch (policy) {
        case DecklistPolicy.RequiredToCheckIn:
            return "description.decklist-required-check-in";
        case DecklistPolicy.RequiredToRegister:
            return "description.decklist-required-register";
        case DecklistPolicy.Optional:
            return null;
    }
}

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
    const me = useAccount();

    const [decklistOpen, setDecklistOpen] = useState(false);
    // Non-null whenever `viewer.participant` is: the viewer's own row is always part of the
    // roster the layout above already loaded.
    const ownParticipant = participants.find((participant) => participant.uuid === viewer.participant) ?? null;
    const hintKey = decklistPolicyHintKey(tournament.decklist_policy);

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

            {viewer.participant != null && (
                <div
                    className={
                        "flex flex-col gap-3 rounded-(--radius-card) border border-zinc-950/10 p-4 dark:border-white/10"
                    }
                >
                    <Text className={"text-sm font-semibold text-zinc-950 dark:text-white"}>
                        {t("heading.your-decklist")}
                    </Text>
                    <div className={"flex flex-wrap items-center gap-2"}>
                        <Badge
                            color={decklistBadgeColor(
                                ownParticipant?.has_decklist ?? false,
                                tournament.decklist_policy,
                            )}
                        >
                            {t(
                                ownParticipant?.has_decklist === true
                                    ? "label.decklist-submitted"
                                    : "label.decklist-missing",
                            )}
                        </Badge>
                        {tournament.decklists_locked_at != null && (
                            <Badge color={"zinc"}>{t("label.decklists-locked")}</Badge>
                        )}
                    </div>
                    {hintKey !== null && <Description>{t(hintKey)}</Description>}
                    <div>
                        <Button outline={true} onClick={() => setDecklistOpen(true)}>
                            {t("button.decklist")}
                        </Button>
                    </div>
                    <DecklistDialog
                        open={decklistOpen}
                        tournamentUuid={tournamentUuid}
                        tournamentFormat={tournament.format}
                        participant={{
                            uuid: viewer.participant,
                            display_name: ownParticipant?.display_name ?? "",
                        }}
                        canPickDeck={me.account !== null}
                        onClose={() => setDecklistOpen(false)}
                        onChanged={() => void router.invalidate()}
                    />
                </div>
            )}

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
