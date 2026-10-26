import { describe, expect, it } from "vitest";
import { BestOf } from "src/api/generated";
import { formatResult, formatTiebreaker, gamesToWin } from "src/utils/tournament-rounds";

describe("formatResult", () => {
    it("writes the games won in Seat order", () => {
        expect(formatResult({ games_won: [2, 1], games_drawn: 0 })).toBe("2-1");
        expect(formatResult({ games_won: [0, 2], games_drawn: 0 })).toBe("0-2");
    });

    it("adds drawn games as a third number", () => {
        expect(formatResult({ games_won: [1, 1], games_drawn: 1 })).toBe("1-1-1");
    });
});

describe("formatTiebreaker", () => {
    it("writes a share as a percentage with two decimals", () => {
        expect(formatTiebreaker(20_711 / 33_600, "en-US")).toBe("61.64%");
        expect(formatTiebreaker(0.33, "en-US")).toBe("33.00%");
        expect(formatTiebreaker(1, "en-US")).toBe("100.00%");
    });

    it("follows the reader's locale", () => {
        expect(formatTiebreaker(0.33, "de-DE")).toBe("33,00 %");
    });
});

describe("gamesToWin", () => {
    it("takes one game in a best of one and two in a best of three", () => {
        expect(gamesToWin(BestOf.One)).toBe(1);
        expect(gamesToWin(BestOf.Three)).toBe(2);
    });
});
