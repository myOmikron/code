import { describe, expect, it } from "vitest";
import { atLeast, between, exactly } from "src/utils/hypergeometric";

describe("hypergeometric", () => {
    it("is certain when every card is a hit", () => {
        expect(atLeast(60, 60, 7, 7)).toBeCloseTo(1, 10);
        expect(exactly(60, 60, 7, 7)).toBeCloseTo(1, 10);
    });

    it("is impossible when the deck holds none", () => {
        expect(atLeast(60, 0, 7, 1)).toBe(0);
        expect(exactly(60, 0, 7, 1)).toBe(0);
    });

    it("matches the textbook opening hand numbers", () => {
        // A 60 card deck with 24 lands opens on two to five lands about 84%
        // of the time; the single land and the flooded hands are the rest.
        expect(between(60, 24, 7, 2, 5)).toBeCloseTo(0.844, 3);
        // At least one of four copies in the opening seven, the "how often do
        // I see my combo piece" number.
        expect(atLeast(60, 4, 7, 1)).toBeCloseTo(0.399, 3);
    });

    it("sums to one over every outcome", () => {
        const total = [0, 1, 2, 3, 4, 5, 6, 7].reduce((sum, hits) => sum + exactly(99, 36, 7, hits), 0);
        expect(total).toBeCloseTo(1, 10);
    });

    it("survives a hundred card deck without overflowing", () => {
        expect(atLeast(99, 36, 7, 3)).toBeGreaterThan(0.5);
        expect(atLeast(99, 36, 7, 3)).toBeLessThan(0.85);
    });

    it("wants nothing and is satisfied", () => {
        expect(atLeast(99, 0, 7, 0)).toBe(1);
    });
});
