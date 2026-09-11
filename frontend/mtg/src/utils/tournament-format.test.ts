import { describe, expect, it } from "vitest";
import type { FormatRulesResponse } from "src/api/generated";
import { formatKind, podSizeFor, pointsFor, recommendedRounds } from "src/utils/tournament-format";

/**
 * One catalog row, the shape `podSizeFor` reads: a slug and whether it wants a commander
 *
 * @param slug the format's slug
 * @param commander whether the format wants a commander
 *
 * @returns a minimal catalog row
 */
function rules(slug: string, commander: boolean): FormatRulesResponse {
    return {
        slug,
        commander: commander ? { kind: "required", min: 1, max: 2 } : { kind: "none" },
    } as unknown as FormatRulesResponse;
}

const FORMATS: Array<FormatRulesResponse> = [rules("commander", true), rules("standard", false)];

describe("pointsFor", () => {
    it("scores a table of two by the Magic Tournament Rules", () => {
        expect(pointsFor(2)).toEqual({ win: 3, draw: 1, loss: 0, bye: 3 });
    });

    it("scores a pod of three, four and five by the Multiplayer Addendum's 2n-1", () => {
        expect(pointsFor(3)).toEqual({ win: 5, draw: 1, loss: 0, bye: 5 });
        expect(pointsFor(4)).toEqual({ win: 7, draw: 1, loss: 0, bye: 7 });
        expect(pointsFor(5)).toEqual({ win: 9, draw: 1, loss: 0, bye: 9 });
    });

    it("keeps a draw at 1 and a loss at 0 in both regimes", () => {
        expect(pointsFor(2).draw).toBe(1);
        expect(pointsFor(2).loss).toBe(0);
        expect(pointsFor(4).draw).toBe(1);
        expect(pointsFor(4).loss).toBe(0);
    });
});

describe("podSizeFor", () => {
    it("seats a pod of four for a commander format", () => {
        expect(podSizeFor("commander", FORMATS)).toBe(4);
    });

    it("seats a table of two for duel, regardless of the catalog", () => {
        expect(podSizeFor("duel", FORMATS)).toBe(2);
    });

    it("seats a table of two for a slug the catalog does not know", () => {
        expect(podSizeFor("unknown-format", FORMATS)).toBe(2);
    });
});

describe("formatKind", () => {
    it("reads draft and sealed as limited", () => {
        expect(formatKind("draft")).toBe("limited");
        expect(formatKind("sealed")).toBe("limited");
    });

    it("reads everything else as constructed", () => {
        expect(formatKind("commander")).toBe("constructed");
        expect(formatKind("standard")).toBe("constructed");
    });
});

describe("recommendedRounds", () => {
    it("halves a duel field down to one undefeated player", () => {
        expect(recommendedRounds(16, 2)).toBe(4);
        expect(recommendedRounds(32, 2)).toBe(5);
        expect(recommendedRounds(64, 2)).toBe(6);
    });

    it("plays a whole evening even for a tiny duel field", () => {
        expect(recommendedRounds(4, 2)).toBe(3);
        expect(recommendedRounds(8, 2)).toBe(3);
    });

    it("runs pods markedly shorter than duels", () => {
        expect(recommendedRounds(16, 4)).toBe(2);
        expect(recommendedRounds(16, 2)).toBe(4);
    });

    it("reads the pod thresholds off the addendum's own table", () => {
        expect(recommendedRounds(5, 4)).toBe(1);
        expect(recommendedRounds(17, 4)).toBe(3);
        expect(recommendedRounds(25, 4)).toBe(4);
        expect(recommendedRounds(33, 4)).toBe(5);
        expect(recommendedRounds(65, 4)).toBe(6);
    });

    it("never recommends fewer than one round", () => {
        expect(recommendedRounds(0, 4)).toBe(1);
        expect(recommendedRounds(1, 2)).toBe(1);
    });
});
