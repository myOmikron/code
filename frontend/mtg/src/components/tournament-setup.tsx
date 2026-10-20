import { Badge, Button, Text } from "components";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TournamentParticipantResponse, TournamentResponse, TournamentViewerResponse } from "src/api/generated";
import { DecklistDialog } from "src/components/decklist-dialog";
import { TournamentJoinBar } from "src/components/tournament-join-code";
import { TournamentNextStep } from "src/components/tournament-next-step";
import { TournamentRoster, TournamentRosterList, decklistMatters } from "src/components/tournament-roster";
import { TournamentSlots } from "src/components/tournament-slots";
import { TournamentVenue } from "src/components/tournament-venue";
import { useAccount } from "src/context/account";

/** The card surface the setup screen's blocks sit on */
const CARD =
    "rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10";

/**
 * The properties for {@link TournamentSetup}
 */
export type TournamentSetupProps = {
    /** The tournament being set up */
    tournamentUuid: string;
    /** The tournament itself */
    tournament: TournamentResponse;
    /** What the viewer may do here */
    viewer: TournamentViewerResponse;
    /** The true roster size, never redacted by the roster view */
    participantCount: number;
    /** The roster, as the viewer is allowed to see it */
    participants: Array<TournamentParticipantResponse>;
    /** Called after anything changed */
    onChanged: () => void | Promise<void>;
};

/**
 * A tournament before it starts: how to join, where it is, and who has signed up
 *
 * @returns the setup screen
 */
export function TournamentSetup({
    tournamentUuid,
    tournament,
    viewer,
    participantCount,
    participants,
    onChanged,
}: TournamentSetupProps) {
    const [t] = useTranslation("tournament");
    const me = useAccount();
    const [decklistOpen, setDecklistOpen] = useState(false);

    // Non-null whenever `viewer.participant` is: the loaded roster always holds the viewer's row.
    const ownParticipant = participants.find((participant) => participant.uuid === viewer.participant) ?? null;
    const hasDecklist = ownParticipant?.has_decklist === true;

    return (
        <div className={"flex flex-col gap-5"}>
            {viewer.is_organizer ? (
                <TournamentJoinBar
                    tournamentUuid={tournamentUuid}
                    joinCode={tournament.join_code}
                    participantCount={participantCount}
                    maxParticipants={tournament.max_participants}
                    mayManage={viewer.may_manage}
                    onChanged={onChanged}
                />
            ) : (
                <TournamentSlots count={participantCount} max={tournament.max_participants} className={CARD} />
            )}

            {tournament.description != null && tournament.description !== "" && <Text>{tournament.description}</Text>}

            {tournament.venue != null && tournament.venue !== "" && (
                <div className={CARD}>
                    <TournamentVenue
                        name={tournament.venue}
                        address={tournament.venue_address}
                        instructions={tournament.venue_instructions}
                    />
                </div>
            )}

            {viewer.participant != null && decklistMatters(tournament) && (
                <div className={clsx(CARD, "flex flex-wrap items-center gap-3")}>
                    <span className={"flex-1 text-sm font-semibold text-zinc-950 dark:text-white"}>
                        {t("heading.your-decklist")}
                    </span>
                    {tournament.decklists_locked_at != null && (
                        <Badge color={"zinc"}>{t("label.decklists-locked")}</Badge>
                    )}
                    <Badge color={hasDecklist ? "green" : "zinc"}>
                        {hasDecklist ? t("label.decklist-submitted") : t("label.decklist-missing")}
                    </Badge>
                    <Button outline={true} onClick={() => setDecklistOpen(true)}>
                        {t("button.decklist")}
                    </Button>
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
                        onChanged={() => void onChanged()}
                    />
                </div>
            )}

            {viewer.is_organizer ? (
                <TournamentRoster
                    tournamentUuid={tournamentUuid}
                    tournament={tournament}
                    viewer={viewer}
                    participants={participants}
                    onChanged={onChanged}
                />
            ) : (
                // A hidden roster still returns the viewer's own row; one name is not worth a list.
                participants.length > 1 && (
                    <TournamentRosterList names={participants.map((participant) => participant.display_name)} />
                )
            )}

            <TournamentNextStep
                tournamentUuid={tournamentUuid}
                status={tournament.status}
                mayManage={viewer.may_manage}
                awaiting={participants
                    .filter((participant) => participant.status === "Registered")
                    .map((participant) => participant.display_name)}
                onChanged={onChanged}
            />
        </div>
    );
}
