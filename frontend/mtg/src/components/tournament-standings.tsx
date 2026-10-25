import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StandingsResponse } from "src/api/generated";

/**
 * The properties for {@link TournamentStandings}
 */
export type TournamentStandingsProps = {
    /** Reads the standings, by id or by share link */
    load: () => Promise<StandingsResponse>;
};

/**
 * The standings of a Tournament: every Participant's place, Match points and
 * record of wins, losses and draws.
 *
 * Participants equal on everything share a place.
 *
 * @returns the standings table
 */
export function TournamentStandings({ load }: TournamentStandingsProps) {
    const [t] = useTranslation("tournament");
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
        <Table striped={true}>
            <TableHead>
                <TableRow>
                    <TableHeader>{t("label.place")}</TableHeader>
                    <TableHeader>{t("label.player")}</TableHeader>
                    <TableHeader>{t("label.match-points")}</TableHeader>
                    <TableHeader>{t("label.record")}</TableHeader>
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
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
