import { Text } from "components";
import { useTranslation } from "react-i18next";
import type { TiebreakerResponse } from "src/api/generated";

/** The properties for {@link TournamentTiebreakerHelp} */
export type TournamentTiebreakerHelpProps = {
    /** Which tiebreakers this event applies, most significant first */
    tiebreakers: Array<TiebreakerResponse>;
};

/**
 * What the standings columns mean, including the percentage floor that makes them look high
 *
 * @returns the explainer
 */
export function TournamentTiebreakerHelp({ tiebreakers }: TournamentTiebreakerHelpProps) {
    const [t] = useTranslation("tournament");

    const terms: Record<TiebreakerResponse, { term: string; description: string }> = {
        MatchPoints: { term: t("heading.points"), description: t("description.tiebreak-points") },
        MatchWinPercent: { term: t("label.tiebreak-mw"), description: t("description.tiebreak-mw") },
        OpponentMatchWinPercent: { term: t("label.tiebreak-omw"), description: t("description.tiebreak-omw") },
        GameWinPercent: { term: t("label.tiebreak-gw"), description: t("description.tiebreak-gw") },
        OpponentGameWinPercent: { term: t("label.tiebreak-ogw"), description: t("description.tiebreak-ogw") },
        OpponentsAveragePoints: {
            term: t("label.tiebreak-opp-points"),
            description: t("description.tiebreak-opp-points"),
        },
    };
    const entries = [
        ...tiebreakers.map((tiebreaker) => ({ key: tiebreaker, ...terms[tiebreaker] })),
        { key: "floor", term: t("label.tiebreak-floor"), description: t("description.tiebreak-floor") },
    ];

    return (
        <details className={"group"}>
            <summary
                className={
                    "cursor-pointer text-sm font-medium text-zinc-700 select-none hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                }
            >
                {t("heading.tiebreakers")}
            </summary>
            <dl className={"mt-3 flex flex-col gap-2"}>
                {entries.map((entry) => (
                    <div key={entry.key} className={"flex flex-col gap-0.5 sm:flex-row sm:gap-3"}>
                        <dt
                            className={"shrink-0 font-mono text-sm font-semibold text-zinc-950 sm:w-24 dark:text-white"}
                        >
                            {entry.term}
                        </dt>
                        <dd>
                            <Text className={"text-sm"}>{entry.description}</Text>
                        </dd>
                    </div>
                ))}
            </dl>
        </details>
    );
}
