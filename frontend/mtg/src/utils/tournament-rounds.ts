import { BestOf } from "src/api/generated";
import type { ResultResponse } from "src/api/generated";

/**
 * A game score as players say it: "2-1", with drawn games as a third number ("1-1-1")
 *
 * @param result the Result of a one-on-one Match
 *
 * @returns the score in Seat order
 */
export function formatResult(result: Pick<ResultResponse, "games_won" | "games_drawn">): string {
    const score = result.games_won.join("-");
    return result.games_drawn > 0 ? `${score}-${result.games_drawn}` : score;
}

/**
 * A Tiebreaker as the standings show it: a percentage with two decimals
 *
 * @param share the Tiebreaker between 0 and 1, as the service sends it
 * @param locale the locale to write it in, the reader's by default
 *
 * @returns the percentage, e.g. "61.64%"
 */
export function formatTiebreaker(share: number, locale?: string): string {
    return new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(share);
}

/**
 * How many games win a Match played best of `bestOf`
 *
 * @param bestOf best of one or of three
 *
 * @returns the games needed
 */
export function gamesToWin(bestOf: BestOf): number {
    return bestOf === BestOf.One ? 1 : 2;
}

/** The most drawn games a Result records, as the service takes it */
export const MAX_DRAWN_GAMES = 3;
