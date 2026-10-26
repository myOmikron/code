import { Subheading, Text } from "components";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopCut } from "src/api/generated";
import type { MatchResponse, RoundsResponse } from "src/api/generated";
import { useTournamentLabels } from "src/components/tournament-labels";
import { bracketColumns, bracketWinnerSeat } from "src/utils/top-cut";

/**
 * The properties for {@link TournamentBracket}
 */
export type TournamentBracketProps = {
    /** Reads the Rounds, by id or by share link */
    load: () => Promise<RoundsResponse>;
    /** The Tournament's Top cut, `null` for none */
    topCut: TopCut | null;
};

/**
 * The Top cut as a bracket: one column per Round from the first of the cut to
 * the final, winners in bold, places not paired yet left open. A multiplayer
 * final is a single column, with a line on who wins a draw.
 *
 * @returns the bracket, or a line saying there is no Top cut
 */
export function TournamentBracket({ load, topCut }: TournamentBracketProps) {
    const [t] = useTranslation("tournament");
    const labels = useTournamentLabels();
    const [rounds, setRounds] = useState<RoundsResponse | null>(null);

    useEffect(() => {
        let gone = false;
        load()
            .then((loaded) => {
                if (!gone) setRounds(loaded);
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [load]);

    if (rounds === null) return null;
    const columns = topCut === null ? [] : bracketColumns(rounds, topCut);
    if (columns.length === 0) return <Text>{t("description.no-top-cut")}</Text>;

    return (
        <div className={"flex flex-col gap-4"}>
            <div className={"overflow-x-auto"}>
                <div className={"flex min-w-max gap-6"}>
                    {columns.map((column, columnIndex) => {
                        // The last column is the final, also when a multiplayer final seats more than two.
                        const final = columnIndex === columns.length - 1;
                        return (
                            <section key={column.size} className={"flex w-56 flex-col gap-3"}>
                                <Subheading>{labels.cutRound(final ? 2 : column.size)}</Subheading>
                                <ol className={"flex flex-1 flex-col justify-around gap-3"}>
                                    {column.matches.map((played, index) => (
                                        <li key={played?.uuid ?? `open-${index}`}>
                                            <BracketMatch
                                                played={played}
                                                winner={
                                                    played &&
                                                    bracketWinnerSeat(played, final, rounds.top_cut_winner ?? null)
                                                }
                                            />
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        );
                    })}
                </div>
            </div>
            {topCut === TopCut.Final && <Text>{t("description.final-draw")}</Text>}
        </div>
    );
}

/**
 * The properties for {@link BracketMatch}
 */
type BracketMatchProps = {
    /** The Match or Bye, `null` for a place not paired yet */
    played: MatchResponse | null;
    /** The index of the Seat that won it, `null` while nobody did */
    winner: number | null;
};

/**
 * One Match of the bracket: its two Seats with the games each won
 *
 * @returns the Match's box
 */
function BracketMatch({ played, winner }: BracketMatchProps) {
    const [t] = useTranslation("tournament");
    const box = "rounded-lg border border-zinc-950/10 dark:border-white/10";

    if (played === null) {
        return (
            <div className={clsx(box, "px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400")}>{t("label.cut-open")}</div>
        );
    }

    const bye = played.table_number == null;
    return (
        <div className={clsx(box, "divide-y divide-zinc-950/5 text-sm dark:divide-white/5")}>
            {played.seats.map((seat, index) => (
                <div
                    key={seat.participant}
                    className={clsx(
                        "flex items-center justify-between gap-2 px-3 py-2",
                        winner === index
                            ? "font-semibold text-zinc-950 dark:text-white"
                            : "text-zinc-600 dark:text-zinc-400",
                    )}
                >
                    <span className={"truncate"}>{seat.name}</span>
                    <span className={"shrink-0 tabular-nums"}>
                        {bye ? t("label.bye") : (played.result?.games_won[index] ?? "")}
                    </span>
                </div>
            ))}
        </div>
    );
}
