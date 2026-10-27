import { TrophyIcon } from "@heroicons/react/20/solid";
import { Button, Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from "components";
import { useTranslation } from "react-i18next";
import { useTournamentParticipation } from "src/context/tournament-participation-context";

/**
 * A direct return to one ongoing Tournament, or an explicit choice among several.
 *
 * @returns the participation entry, or nothing without ongoing participation
 */
export function TournamentParticipationEntry() {
    const [t] = useTranslation("menu");
    const participation = useTournamentParticipation();
    const active = new Set(participation?.ongoing_participations ?? []);
    const ongoing = participation?.participating.filter((tournament) => active.has(tournament.uuid)) ?? [];
    if (ongoing.length === 0) return null;
    return (
        <nav aria-label={t("accessibility.ongoing-tournaments")} className={"mb-4 flex min-w-0"}>
            {ongoing.length === 1 ? (
                <Button
                    outline
                    href={"/tournaments/$tournamentUuid"}
                    params={{ tournamentUuid: ongoing[0].uuid }}
                    className={"max-w-full"}
                >
                    <TrophyIcon />
                    <span className={"truncate"}>{t("button.return-to-tournament", { name: ongoing[0].name })}</span>
                </Button>
            ) : (
                <Dropdown>
                    <DropdownButton outline>
                        <TrophyIcon />
                        {t("button.choose-ongoing-tournament", { count: ongoing.length })}
                    </DropdownButton>
                    <DropdownMenu anchor={"bottom start"}>
                        {ongoing.map((tournament) => (
                            <DropdownItem
                                key={tournament.uuid}
                                href={"/tournaments/$tournamentUuid"}
                                params={{ tournamentUuid: tournament.uuid }}
                            >
                                <DropdownLabel>{tournament.name}</DropdownLabel>
                            </DropdownItem>
                        ))}
                    </DropdownMenu>
                </Dropdown>
            )}
        </nav>
    );
}
