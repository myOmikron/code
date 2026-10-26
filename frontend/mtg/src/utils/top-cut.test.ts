import { describe, expect, it } from "vitest";
import { ResultState, RoundStage, RoundState, TopCut } from "src/api/generated";
import type { MatchResponse, RoundResponse, RoundsResponse } from "src/api/generated";
import { bracketColumns, bracketWinnerSeat, cutRoundSize, winnerSeat } from "src/utils/top-cut";

/**
 * A Match of `names`, or a Bye of one
 *
 * @param names who sits there in Seat order
 * @param games the games won per Seat, none while it has no Result
 *
 * @returns the Match as the service sends it
 */
function match(names: Array<string>, games?: Array<number>): MatchResponse {
    return {
        uuid: names.join("-"),
        table_number: names.length === 1 ? null : 1,
        seats: names.map((name, index) => ({ participant: name, name, guest: true, seat: index + 1 })),
        result:
            games === undefined
                ? null
                : {
                      games_won: games,
                      games_drawn: 0,
                      state: ResultState.Confirmed,
                      reported_by: null,
                      disputed_by: null,
                  },
        rematch: false,
    };
}

/**
 * A Round
 *
 * @param number its number
 * @param stage Swiss or Top cut
 * @param matches its Matches and Byes
 * @param state how far it got
 *
 * @returns the Round as the service sends it
 */
function round(
    number: number,
    stage: RoundStage,
    matches: Array<MatchResponse>,
    state: RoundState = RoundState.Ended,
): RoundResponse {
    return { number, stage, state, matches };
}

/**
 * The Rounds of a Tournament
 *
 * @param size how many the Top cut takes, `null` for none
 * @param list the Rounds
 *
 * @returns the Rounds as the service sends them
 */
function rounds(size: number | null, list: Array<RoundResponse>): RoundsResponse {
    return {
        rounds: list,
        swiss_rounds: 1,
        suggested_swiss_rounds: 1,
        top_cut_size: size,
        top_cut_winner: null,
        server_time: "2026-11-07T18:30:00Z",
    };
}

describe("winnerSeat", () => {
    it("is the Seat with more games", () => {
        expect(winnerSeat(match(["a", "b"], [0, 2]))).toBe(1);
        expect(winnerSeat(match(["a", "b"], [2, 1]))).toBe(0);
    });

    it("is nobody without a Result or on a draw", () => {
        expect(winnerSeat(match(["a", "b"]))).toBeNull();
        expect(winnerSeat(match(["a", "b"], [1, 1]))).toBeNull();
    });

    it("is the Bye's only Seat", () => {
        expect(winnerSeat(match(["a"]))).toBe(0);
    });
});

describe("cutRoundSize", () => {
    it("counts two Participants per Match and per Bye", () => {
        expect(cutRoundSize(round(2, RoundStage.TopCut, [match(["a", "b"]), match(["c", "d"])]))).toBe(4);
        expect(cutRoundSize(round(3, RoundStage.TopCut, [match(["a", "b"]), match(["c"])]))).toBe(4);
        expect(cutRoundSize(round(4, RoundStage.TopCut, [match(["a", "b"])]))).toBe(2);
    });
});

describe("bracketColumns", () => {
    it("is empty without a Top cut", () => {
        expect(bracketColumns(rounds(null, []), TopCut.Top4)).toEqual([]);
        expect(bracketColumns(rounds(null, []), TopCut.Final)).toEqual([]);
    });

    it("shows every Round of a Top 8 with open places for those not paired yet", () => {
        const quarterfinals = [match(["1", "8"], [1, 0]), match(["4", "5"]), match(["2", "7"]), match(["3", "6"])];
        const columns = bracketColumns(
            rounds(8, [
                round(1, RoundStage.Swiss, [match(["x", "y"], [1, 0])]),
                round(2, RoundStage.TopCut, quarterfinals, RoundState.Running),
            ]),
            TopCut.Top8,
        );
        expect(columns.map((column) => column.size)).toEqual([8, 4, 2]);
        expect(columns[0].matches).toEqual(quarterfinals);
        expect(columns[1].matches).toEqual([null, null]);
        expect(columns[2].matches).toEqual([null]);
    });

    it("leaves a previewed Round out", () => {
        const columns = bracketColumns(
            rounds(4, [round(2, RoundStage.TopCut, [match(["1", "4"]), match(["2", "3"])], RoundState.Previewed)]),
            TopCut.Top4,
        );
        expect(columns[0].matches).toEqual([null, null]);
    });
});

describe("a multiplayer final", () => {
    it("is one column of one Match, open until it is paired", () => {
        const swiss = round(1, RoundStage.Swiss, [match(["a", "b", "c", "d"], [1, 0, 0, 0])]);
        expect(bracketColumns(rounds(4, [swiss]), TopCut.Final)).toEqual([{ size: 4, matches: [null] }]);

        const fin = match(["1", "2", "3", "4"]);
        const columns = bracketColumns(
            rounds(4, [swiss, round(2, RoundStage.TopCut, [fin], RoundState.Running)]),
            TopCut.Final,
        );
        expect(columns).toEqual([{ size: 4, matches: [fin] }]);
    });

    it("is won by the Top cut's winner, also when drawn", () => {
        const drawn = match(["1", "2", "3", "4"], [0, 0, 0, 0]);
        expect(bracketWinnerSeat(drawn, true, "1")).toBe(0);
        expect(bracketWinnerSeat(drawn, true, "2")).toBe(1);
        expect(bracketWinnerSeat(drawn, true, null)).toBeNull();
    });

    it("leaves the other Rounds of a bracket to the games won", () => {
        expect(bracketWinnerSeat(match(["a", "b"], [0, 2]), false, "a")).toBe(1);
    });
});
