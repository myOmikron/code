import { useTranslation } from "react-i18next";
import { useTournamentParticipation } from "src/context/tournament-participation-context";
import { Link } from "@tanstack/react-router";
import {
    Badge,
    StackedList,
    StackedListDescription,
    StackedListFlexRow,
    StackedListItem,
    StackedListTitle,
} from "components";
import type { TournamentSummaryResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { formatStart, useTournamentLabels } from "src/components/tournament-labels";

/**
 * The properties for {@link TournamentList}
 */
export type TournamentListProps = {
    /** The Tournaments, in the order to show them */
    tournaments: Array<TournamentSummaryResponse>;
    /** Whether each row names the Owner, which a list of one's own leaves out */
    showOwner: boolean;
};

/**
 * Tournaments as rows, each leading to the Tournament's page.
 *
 * @returns the list
 */
export function TournamentList({ tournaments, showOwner }: TournamentListProps) {
    const [t] = useTranslation("tournament");
    const participation = useTournamentParticipation();
    const mine = new Set(participation?.participating.map((tournament) => tournament.uuid) ?? []);
    const labels = useTournamentLabels();
    const deckLabels = useDeckLabels();

    return (
        <StackedList>
            {tournaments.map((tournament) => (
                <StackedListFlexRow key={tournament.uuid} className={"flex-col gap-y-2 max-sm:items-start sm:flex-row"}>
                    <StackedListItem className={"max-w-full"}>
                        <StackedListTitle>
                            <Link
                                to={"/tournaments/$tournamentUuid"}
                                params={{ tournamentUuid: tournament.uuid }}
                                className={"hover:underline"}
                            >
                                {tournament.name}
                            </Link>
                        </StackedListTitle>
                        <StackedListDescription>
                            {[
                                formatStart(tournament.starts_at),
                                tournament.location,
                                showOwner ? labels.organizedBy(tournament.owner) : null,
                            ]
                                .filter((part) => part != null && part !== "")
                                .join(" · ")}
                        </StackedListDescription>
                    </StackedListItem>
                    <div className={"flex max-w-full flex-wrap justify-start gap-2 sm:justify-end"}>
                        {mine.has(tournament.uuid) && <Badge color={"lime"}>{t("label.you-participate")}</Badge>}
                        {tournament.format != null && (
                            <Badge color={"lime"}>{deckLabels.format(tournament.format)}</Badge>
                        )}
                        <Badge color={"zinc"}>{labels.ruleset(tournament.ruleset)}</Badge>
                        <Badge color={"sky"}>{labels.state(tournament.state)}</Badge>
                    </div>
                </StackedListFlexRow>
            ))}
        </StackedList>
    );
}
