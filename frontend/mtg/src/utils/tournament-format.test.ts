import { describe, expect, it } from "vitest";
import { RoundKind } from "src/api/generated";
import { formatKind, nextRoundKind, podSizeFor, pointsFor, recommendedRounds } from "src/utils/tournament-format";

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
    it("seats a pod of four for the formats played in pods", () => {
        expect(podSizeFor("commander")).toBe(4);
        expect(podSizeFor("predh")).toBe(4);
        expect(podSizeFor("paupercommander")).toBe(4);
        expect(podSizeFor("oathbreaker")).toBe(4);
    });

    it("seats a table of two for the commander formats played one on one", () => {
        // Each of these wants a commander and is still a duel, which is exactly
        // what reading "has a commander" as "is multiplayer" used to get wrong.
        expect(podSizeFor("duel")).toBe(2);
        expect(podSizeFor("archon")).toBe(2);
        expect(podSizeFor("brawl")).toBe(2);
        expect(podSizeFor("competitivebrawl")).toBe(2);
        expect(podSizeFor("standardbrawl")).toBe(2);
    });

    it("seats a table of two for the sixty card and limited formats", () => {
        expect(podSizeFor("modern")).toBe(2);
        expect(podSizeFor("draft")).toBe(2);
    });

    it("seats a table of two for a slug it does not recognise", () => {
        expect(podSizeFor("unknown-format")).toBe(2);
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

describe("nextRoundKind", () => {
    const swiss = { kind: RoundKind.Swiss };
    const draft = { kind: RoundKind.Draft };
    const build = { kind: RoundKind.Deckbuilding };

    it("walks a draft through draft, deckbuilding, then scored rounds", () => {
        expect(nextRoundKind("draft", [])).toBe(RoundKind.Draft);
        expect(nextRoundKind("draft", [draft])).toBe(RoundKind.Deckbuilding);
        expect(nextRoundKind("draft", [draft, build])).toBe(RoundKind.Swiss);
        expect(nextRoundKind("draft", [draft, build, swiss])).toBe(RoundKind.Swiss);
    });

    it("walks a sealed event through deckbuilding, then scored rounds", () => {
        expect(nextRoundKind("sealed", [])).toBe(RoundKind.Deckbuilding);
        expect(nextRoundKind("sealed", [build])).toBe(RoundKind.Swiss);
    });

    it("gives a constructed event scored rounds from the start", () => {
        expect(nextRoundKind("modern", [])).toBe(RoundKind.Swiss);
        expect(nextRoundKind("commander", [swiss, swiss])).toBe(RoundKind.Swiss);
    });
});
