import { describe, expect, it } from "vitest";
import { BestOf } from "src/api/generated";
import { formatResult, gamesToWin } from "src/utils/tournament-rounds";

describe("formatResult", () => {
    it("writes the games won in Seat order", () => {
        expect(formatResult({ games_won: [2, 1], games_drawn: 0 })).toBe("2-1");
        expect(formatResult({ games_won: [0, 2], games_drawn: 0 })).toBe("0-2");
    });

    it("adds drawn games as a third number", () => {
        expect(formatResult({ games_won: [1, 1], games_drawn: 1 })).toBe("1-1-1");
    });
});

describe("gamesToWin", () => {
    it("takes one game in a best of one and two in a best of three", () => {
        expect(gamesToWin(BestOf.One)).toBe(1);
        expect(gamesToWin(BestOf.Three)).toBe(2);
    });
});
