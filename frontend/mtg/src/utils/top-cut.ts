import { RoundStage, RoundState } from "src/api/generated";
import type { MatchResponse, RoundResponse, RoundsResponse } from "src/api/generated";

/**
 * One Round of the Top cut as the bracket shows it
 */
export type BracketColumn = {
    /** How many Participants the Round starts with: 8 for the quarterfinals, 2 for the final */
    size: number;
    /** Its Matches and Byes in bracket order, `null` for a place not paired yet */
    matches: Array<MatchResponse | null>;
};

/**
 * The Seat that won a Top cut Match: more games than the other; a Bye's only Seat
 *
 * @param played the Match or Bye
 *
 * @returns the Seat's index, `null` without a Result or without a winner
 */
export function winnerSeat(played: MatchResponse): number | null {
    if (played.table_number == null) return 0;
    if (played.result == null) return null;
    const most = Math.max(...played.result.games_won);
    const leaders = played.result.games_won.flatMap((won, seat) => (won === most ? [seat] : []));
    return leaders.length === 1 ? leaders[0] : null;
}

/**
 * How many Participants a Top cut Round starts with: two per Match or Bye
 *
 * @param round the Round
 *
 * @returns 8 for quarterfinals, 4 for semifinals, 2 for the final
 */
export function cutRoundSize(round: RoundResponse): number {
    return 2 * round.matches.length;
}

/**
 * The Top cut as a bracket: one column per Round, the Rounds not played yet as open places
 *
 * @param rounds the Tournament's Rounds with the size of its Top cut
 *
 * @returns the columns, the first Round of the cut first; none without a Top cut
 */
export function bracketColumns(rounds: RoundsResponse): Array<BracketColumn> {
    const size = rounds.top_cut_size;
    if (size == null || size < 2) return [];
    const played = rounds.rounds.filter(
        (round) => round.stage === RoundStage.TopCut && round.state !== RoundState.Previewed,
    );
    const columns: Array<BracketColumn> = [];
    for (let left = size, index = 0; left >= 2; left /= 2, index++) {
        const places = left / 2;
        const matches: Array<MatchResponse | null> = [...(played[index]?.matches ?? [])];
        while (matches.length < places) matches.push(null);
        columns.push({ size: left, matches });
    }
    return columns;
}
