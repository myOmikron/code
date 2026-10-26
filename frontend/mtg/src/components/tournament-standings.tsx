import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StandingsResponse } from "src/api/generated";
import { useTournamentLabels } from "src/components/tournament-labels";
import { formatTiebreaker } from "src/utils/tournament-rounds";

/**
 * The properties for {@link TournamentStandings}
 */
export type TournamentStandingsProps = {
    /** Reads the standings, by id or by share link */
    load: () => Promise<StandingsResponse>;
};

/**
 * The standings of a Tournament: every Participant's place, Match points,
 * record of wins, losses and draws, and the Ruleset's Tiebreakers.
 *
 * Participants equal on Match points and every Tiebreaker share a place.
 *
 * @returns the standings table
 */
export function TournamentStandings({ load }: TournamentStandingsProps) {
    const [t] = useTranslation("tournament");
    const labels = useTournamentLabels();
    const [standings, setStandings] = useState<StandingsResponse | null>(null);

    useEffect(() => {
        let gone = false;
        load()
            .then((loaded) => {
                if (!gone) setStandings(loaded);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [load]);

    if (standings === null) return null;
    if (standings.standings.length === 0) return <Text>{t("description.no-participants")}</Text>;

    return (
        <div className={"flex flex-col gap-4"}>
            <Table striped={true}>
                <TableHead>
                    <TableRow>
                        <TableHeader>{t("label.place")}</TableHeader>
                        <TableHeader>{t("label.player")}</TableHeader>
                        <TableHeader>{t("label.match-points")}</TableHeader>
                        <TableHeader>{t("label.record")}</TableHeader>
                        {standings.tiebreakers.map((tiebreaker) => (
                            <TableHeader key={tiebreaker} className={"text-right"}>
                                <abbr title={labels.tiebreakerDescription(tiebreaker)} className={"no-underline"}>
                                    {labels.tiebreaker(tiebreaker)}
                                </abbr>
                            </TableHeader>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {standings.standings.map((line) => (
                        <TableRow key={line.participant}>
                            <TableCell>{line.place}</TableCell>
                            <TableCell>
                                <span className={"flex items-center gap-2"}>
                                    {line.name}
                                    {line.guest && <Badge color={"zinc"}>{t("label.guest")}</Badge>}
                                </span>
                            </TableCell>
                            <TableCell>{line.match_points}</TableCell>
                            <TableCell>
                                {t("label.record-value", {
                                    wins: line.wins,
                                    losses: line.losses,
                                    draws: line.draws,
                                })}
                                {line.byes > 0 && ` ${t("label.record-byes", { count: line.byes })}`}
                            </TableCell>
                            {standings.tiebreakers.map((tiebreaker, index) => (
                                <TableCell key={tiebreaker} className={"text-right tabular-nums"}>
                                    {formatTiebreaker(line.tiebreakers[index] ?? 0)}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {standings.tiebreakers.length > 0 && (
                <div className={"flex flex-col gap-1"}>
                    <Text>{t("description.tiebreakers")}</Text>
                    {standings.tiebreakers.map((tiebreaker) => (
                        <Text key={tiebreaker}>{labels.tiebreakerDescription(tiebreaker)}</Text>
                    ))}
                </div>
            )}
        </div>
    );
}
