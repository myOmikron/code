import { CopyButton, DescriptionDetails, DescriptionList, DescriptionTerm, Text } from "components";
import { useTranslation } from "react-i18next";
import { Visibility } from "src/api/generated";
import type { TournamentResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { formatStart, useTournamentLabels } from "src/components/tournament-labels";
import { tournamentShareLink } from "src/utils/share-link";
import { formatEntryFee } from "src/utils/entry-fee";

/**
 * The properties for {@link TournamentDetails}
 */
export type TournamentDetailsProps = {
    /** The Tournament as the reader sees it */
    tournament: TournamentResponse;
};

/**
 * What a Tournament is: when and where, how it is played and who may see it.
 *
 * The share link shows only where the response carries one, which is for the
 * Organizers of an unlisted Tournament.
 *
 * @returns the details
 */
export function TournamentDetails({ tournament }: TournamentDetailsProps) {
    const [t] = useTranslation("tournament");
    const labels = useTournamentLabels();
    const deckLabels = useDeckLabels();

    return (
        <div className={"flex flex-col gap-6"}>
            {tournament.description != null && tournament.description !== "" && (
                <Text className={"whitespace-pre-line"}>{tournament.description}</Text>
            )}
            <DescriptionList>
                <DescriptionTerm>{t("label.starts-at")}</DescriptionTerm>
                <DescriptionDetails>{formatStart(tournament.starts_at)}</DescriptionDetails>

                {tournament.location != null && tournament.location !== "" && (
                    <>
                        <DescriptionTerm>{t("label.location")}</DescriptionTerm>
                        <DescriptionDetails>{tournament.location}</DescriptionDetails>
                    </>
                )}

                <DescriptionTerm>{t("label.table-size")}</DescriptionTerm>
                <DescriptionDetails>{labels.tableSize(tournament.table_size)}</DescriptionDetails>

                <DescriptionTerm>{t("label.ruleset")}</DescriptionTerm>
                <DescriptionDetails>
                    {labels.ruleset(tournament.ruleset)}
                    <Text>{labels.rulesetDescription(tournament.ruleset)}</Text>
                </DescriptionDetails>

                {tournament.best_of != null && (
                    <>
                        <DescriptionTerm>{t("label.best-of")}</DescriptionTerm>
                        <DescriptionDetails>{labels.bestOf(tournament.best_of)}</DescriptionDetails>
                    </>
                )}

                <DescriptionTerm>{t("label.round-minutes")}</DescriptionTerm>
                <DescriptionDetails>
                    {tournament.round_minutes == null
                        ? t("label.no-round-timer")
                        : t("label.round-minutes-value", { count: tournament.round_minutes })}
                </DescriptionDetails>
                {tournament.table_size === 2 && (
                    <>
                        <DescriptionTerm>{t("label.top-cut")}</DescriptionTerm>
                        <DescriptionDetails>
                            {labels.topCut(tournament.top_cut ?? null)}
                            {tournament.top_cut_best_of != null && ` · ${labels.bestOf(tournament.top_cut_best_of)}`}
                        </DescriptionDetails>
                    </>
                )}

                <DescriptionTerm>{t("label.format")}</DescriptionTerm>
                <DescriptionDetails>
                    {tournament.format == null ? t("label.format-any") : deckLabels.format(tournament.format)}
                </DescriptionDetails>

                <DescriptionTerm>{t("label.self-sign-up")}</DescriptionTerm>
                <DescriptionDetails>
                    {tournament.self_sign_up ? t("label.self-sign-up-on") : t("label.self-sign-up-off")}
                </DescriptionDetails>

                {tournament.participant_limit != null && (
                    <>
                        <DescriptionTerm>{t("label.participant-limit")}</DescriptionTerm>
                        <DescriptionDetails>{tournament.participant_limit}</DescriptionDetails>
                    </>
                )}

                <DescriptionTerm>{t("label.run-mode")}</DescriptionTerm>
                <DescriptionDetails>
                    {tournament.entered_afterwards ? t("label.run-mode-afterwards") : t("label.run-mode-live")}
                </DescriptionDetails>

                <DescriptionTerm>{t("label.entry-fee")}</DescriptionTerm>
                <DescriptionDetails>
                    {tournament.entry_fee == null ? t("label.entry-fee-none") : formatEntryFee(tournament.entry_fee)}
                </DescriptionDetails>

                <DescriptionTerm>{t("label.state")}</DescriptionTerm>
                <DescriptionDetails>{labels.state(tournament.state)}</DescriptionDetails>

                {tournament.organizer_role != null && (
                    <>
                        <DescriptionTerm>{t("label.visibility")}</DescriptionTerm>
                        <DescriptionDetails>{labels.visibility(tournament.visibility)}</DescriptionDetails>
                    </>
                )}

                {tournament.visibility === Visibility.Unlisted && tournament.share_token != null && (
                    <>
                        <DescriptionTerm>{t("label.share-link")}</DescriptionTerm>
                        <DescriptionDetails>
                            <span className={"flex items-center gap-2"}>
                                <span className={"truncate"}>{tournamentShareLink(tournament.share_token)}</span>
                                <CopyButton value={tournamentShareLink(tournament.share_token)} />
                            </span>
                            <Text>{t("description.share-link")}</Text>
                        </DescriptionDetails>
                    </>
                )}
            </DescriptionList>
        </div>
    );
}
