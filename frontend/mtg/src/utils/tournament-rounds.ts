import { BestOf, Tiebreaker } from "src/api/generated";
import type { ResultResponse, SetResultRequest } from "src/api/generated";

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
 * A Tiebreaker's value as the standings show it
 *
 * The opponents' average Match points are a number of points with two
 * decimals; every other Tiebreaker is a share, written by {@link formatTiebreaker}.
 *
 * @param tiebreaker which Tiebreaker the value belongs to
 * @param value the value as the service sends it
 * @param locale the locale to write it in, the reader's by default
 *
 * @returns the value, e.g. "4.17" or "61.64%"
 */
export function formatTiebreakerValue(tiebreaker: Tiebreaker, value: number, locale?: string): string {
    if (tiebreaker === Tiebreaker.OpponentAverageMatchPoints) {
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    }
    return formatTiebreaker(value, locale);
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

/**
 * The Seat that won a multiplayer Match, which is a single game
 *
 * @param result the Result of the Match
 *
 * @returns the index of the winning Seat, `null` for a draw
 */
export function winnerSeat(result: Pick<ResultResponse, "games_won" | "games_drawn">): number | null {
    const seat = result.games_won.findIndex((won) => won > 0);
    return result.games_drawn > 0 || seat < 0 ? null : seat;
}

/**
 * The Result of a multiplayer Match as the service takes it
 *
 * @param seats how many Seats the Match has
 * @param winner the index of the winning Seat, `null` for a draw
 *
 * @returns one game won by the winner, or one drawn game
 */
export function singleGameResult(seats: number, winner: number | null): SetResultRequest {
    return {
        games_won: Array.from({ length: seats }, (_, seat) => (seat === winner ? 1 : 0)),
        games_drawn: winner === null ? 1 : 0,
    };
}
