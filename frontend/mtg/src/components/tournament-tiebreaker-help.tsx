import { Text } from "components";
import { useTranslation } from "react-i18next";
import type { TiebreakerResponse } from "src/api/generated";

/**
 * The properties for {@link TournamentTiebreakerHelp}
 */
export type TournamentTiebreakerHelpProps = {
    /** Which tiebreakers this event applies, most significant first */
    tiebreakers: Array<TiebreakerResponse>;
};

/**
 * What the columns mean, and why a number that looks wrong is not.
 *
 * Worth the space because the floor makes the table impossible to check by hand without it: a
 * player who lost every match still contributes a third of a win to their opponents' percentage,
 * so the averages never go as low as a reader expects. Somebody who does not know that does not
 * conclude "there is a rule I do not know", they conclude the software is broken.
 *
 * @returns the explainer
 */
export function TournamentTiebreakerHelp({ tiebreakers }: TournamentTiebreakerHelpProps) {
    const [t] = useTranslation("tournament");

    /** The one-line explanation of a column */
    const explain = (tiebreaker: TiebreakerResponse): { term: string; description: string } | null => {
        switch (tiebreaker) {
            case "MatchPoints":
                return { term: t("heading.points"), description: t("description.tiebreak-points") };
            case "MatchWinPercent":
                return { term: t("label.tiebreak-mw"), description: t("description.tiebreak-mw") };
            case "OpponentMatchWinPercent":
                return { term: t("label.tiebreak-omw"), description: t("description.tiebreak-omw") };
            case "GameWinPercent":
                return { term: t("label.tiebreak-gw"), description: t("description.tiebreak-gw") };
            case "OpponentGameWinPercent":
                return { term: t("label.tiebreak-ogw"), description: t("description.tiebreak-ogw") };
            case "OpponentsAveragePoints":
                return {
                    term: t("label.tiebreak-opp-points"),
                    description: t("description.tiebreak-opp-points"),
                };
        }
    };

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
                {tiebreakers.map((tiebreaker) => {
                    const entry = explain(tiebreaker);
                    if (entry === null) return null;
                    return (
                        <div key={tiebreaker} className={"flex flex-col gap-0.5 sm:flex-row sm:gap-3"}>
                            <dt
                                className={
                                    "shrink-0 font-mono text-sm font-semibold text-zinc-950 sm:w-24 dark:text-white"
                                }
                            >
                                {entry.term}
                            </dt>
                            <dd>
                                <Text className={"text-sm"}>{entry.description}</Text>
                            </dd>
                        </div>
                    );
                })}
                <div className={"flex flex-col gap-0.5 sm:flex-row sm:gap-3"}>
                    <dt className={"shrink-0 font-mono text-sm font-semibold text-zinc-950 sm:w-24 dark:text-white"}>
                        {t("label.tiebreak-floor")}
                    </dt>
                    <dd>
                        <Text className={"text-sm"}>{t("description.tiebreak-floor")}</Text>
                    </dd>
                </div>
            </dl>
        </details>
    );
}
