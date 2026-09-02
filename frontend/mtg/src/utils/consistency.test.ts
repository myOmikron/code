import { describe, expect, it } from "vitest";
import { hypergeomAtLeast, meanManaValue, mulliganAdjusted, openingHandOdds } from "src/utils/consistency";

/**
 * An independent derivation of `P(X = 0)` — "none of the `n` drawn cards are
 * one of the `K` successes" — via the direct multiplicative definition
 * rather than `consistency.ts`'s log-choose one. Used only to cross-check
 * `hypergeomAtLeast`'s symmetry property below; a bug shared between both
 * implementations would have to be the same bug in two different pieces of
 * arithmetic.
 *
 * @param K how many successes the deck holds
 * @param N the deck size
 * @param n how many cards are drawn
 *
 * @returns `P(X = 0)`
 */
function directMissChance(K: number, N: number, n: number): number {
    let p = 1;
    for (let i = 0; i < n; i++) {
        p *= (N - K - i) / (N - i);
    }
    return p;
}

describe("hypergeomAtLeast", () => {
    it("agrees with a well-known real number: 1 Sol Ring in the opening 7 of 99", () => {
        // The one every cEDH player already knows the shape of: roughly 1 in
        // 14 draws is a specific singleton, and 7 draws land it a bit under
        // half the time.
        expect(hypergeomAtLeast(1, 1, 99, 7)).toBeCloseTo(7 / 99, 5);
    });

    it("matches an independent P(0) derivation — the symmetry the task file asks for", () => {
        for (const [K, N, n] of [
            [8, 99, 7],
            [12, 99, 9],
            [3, 60, 7],
            [20, 99, 13],
        ]) {
            const atLeastOne = hypergeomAtLeast(1, K, N, n);
            const missChance = directMissChance(K, N, n);
            expect(atLeastOne).toBeCloseTo(1 - missChance, 10);
        }
    });

    it("is 0 with no copies of the class (K=0)", () => {
        expect(hypergeomAtLeast(1, 0, 99, 7)).toBe(0);
    });

    it("is 1 when the whole deck is the class (K=N)", () => {
        expect(hypergeomAtLeast(1, 99, 99, 7)).toBe(1);
        expect(hypergeomAtLeast(7, 99, 99, 7)).toBe(1);
    });

    it("reads a full-deck draw (n>=N) as guaranteed to see every success", () => {
        expect(hypergeomAtLeast(10, 10, 99, 99)).toBe(1);
        expect(hypergeomAtLeast(11, 10, 99, 99)).toBe(0);
        // n past the deck size behaves exactly like n === N.
        expect(hypergeomAtLeast(10, 10, 99, 500)).toBe(1);
    });

    it("treats 'at least 0' as certain", () => {
        expect(hypergeomAtLeast(0, 5, 99, 7)).toBe(1);
        expect(hypergeomAtLeast(-3, 5, 99, 7)).toBe(1);
    });

    it("is 0 on an empty deck rather than NaN", () => {
        expect(hypergeomAtLeast(1, 5, 0, 7)).toBe(0);
    });

    it("cannot exceed 1 or go negative for a sweep of realistic decks", () => {
        for (let K = 0; K <= 20; K += 4) {
            for (let n = 1; n <= 13; n += 3) {
                const p = hypergeomAtLeast(1, K, 99, n);
                expect(p).toBeGreaterThanOrEqual(0);
                expect(p).toBeLessThanOrEqual(1);
            }
        }
    });

    it("rises monotonically as more cards are seen", () => {
        const seven = hypergeomAtLeast(1, 10, 99, 7);
        const nine = hypergeomAtLeast(1, 10, 99, 9);
        const eleven = hypergeomAtLeast(1, 10, 99, 11);
        expect(nine).toBeGreaterThan(seven);
        expect(eleven).toBeGreaterThan(nine);
    });
});

describe("openingHandOdds", () => {
    it("reads the opening hand as 7 cards seen", () => {
        const odds = openingHandOdds(10, 99);
        expect(odds.openingHand).toBeCloseTo(hypergeomAtLeast(1, 10, 99, 7), 10);
    });

    it("turn 1 on the play is identical to the opening hand — no draw yet", () => {
        const odds = openingHandOdds(10, 99);
        expect(odds.byTurn(1)).toBeCloseTo(odds.openingHand, 10);
    });

    it("turn 3 has seen 7 + 2 = 9 cards, one draw for turn 2 and one for turn 3", () => {
        const odds = openingHandOdds(10, 99);
        expect(odds.byTurn(3)).toBeCloseTo(hypergeomAtLeast(1, 10, 99, 9), 10);
    });

    it("odds climb turn over turn", () => {
        const odds = openingHandOdds(10, 99);
        expect(odds.byTurn(3)).toBeGreaterThan(odds.byTurn(1));
        expect(odds.byTurn(6)).toBeGreaterThan(odds.byTurn(3));
    });
});

describe("meanManaValue", () => {
    it("is quantity-weighted and excludes lands", () => {
        const cards = [
            { manaValue: 0, qty: 36, isLand: true },
            { manaValue: 1, qty: 10, isLand: false },
            { manaValue: 3, qty: 20, isLand: false },
        ];
        // (1*10 + 3*20) / 30 = 70/30 = 2.333... -> one decimal
        expect(meanManaValue(cards)).toBe(2.3);
    });

    it("is null with no nonland cards", () => {
        expect(meanManaValue([{ manaValue: 0, qty: 36, isLand: true }])).toBeNull();
        expect(meanManaValue([])).toBeNull();
    });

    it("rounds to one decimal", () => {
        const cards = [
            { manaValue: 2, qty: 1, isLand: false },
            { manaValue: 3, qty: 1, isLand: false },
            { manaValue: 3, qty: 1, isLand: false },
        ];
        // (2+3+3)/3 = 2.666... -> 2.7
        expect(meanManaValue(cards)).toBe(2.7);
    });
});

describe("mulliganAdjusted", () => {
    it("matches the plain opening-hand number with zero mulligans", () => {
        expect(mulliganAdjusted(10, 99, 0)).toBeCloseTo(hypergeomAtLeast(1, 10, 99, 7), 10);
    });

    it("rises with more free mulligans available", () => {
        const zero = mulliganAdjusted(3, 99, 0);
        const one = mulliganAdjusted(3, 99, 1);
        const two = mulliganAdjusted(3, 99, 2);
        expect(one).toBeGreaterThan(zero);
        expect(two).toBeGreaterThan(one);
    });

    it("matches the closed form directly: 1 - (miss chance)^(mulligans + 1)", () => {
        const missOnce = 1 - hypergeomAtLeast(1, 5, 99, 7);
        expect(mulliganAdjusted(5, 99, 2)).toBeCloseTo(1 - missOnce ** 3, 10);
    });

    it("never exceeds 1 even with many mulligans", () => {
        expect(mulliganAdjusted(10, 99, 10)).toBeLessThanOrEqual(1);
    });
});
