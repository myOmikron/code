import { describe, expect, it } from "vitest";
import { foldPriceCents, unitPriceCents } from "src/utils/prices";

describe("unitPriceCents", () => {
    it("values anything but plain cardboard as a foil", () => {
        expect(unitPriceCents("Nonfoil", 100, 500)).toBe(100);
        expect(unitPriceCents("Foil", 100, 500)).toBe(500);
        expect(unitPriceCents("Etched", 100, 500)).toBe(500);
    });

    it("falls back to the ordinary price and keeps an unpriced card unpriced", () => {
        expect(unitPriceCents("Foil", 100, null)).toBe(100);
        expect(unitPriceCents("Etched", 100, undefined)).toBe(100);
        expect(unitPriceCents("Nonfoil", null, 500)).toBeNull();
    });
});

describe("foldPriceCents", () => {
    it("spreads the spend over every copy", () => {
        expect(
            foldPriceCents([
                { priceCents: 1000, quantity: 1 },
                { priceCents: 400, quantity: 1 },
            ]),
        ).toBe(700);
        expect(
            foldPriceCents([
                { priceCents: 1000, quantity: 1 },
                { priceCents: null, quantity: 3 },
            ]),
        ).toBe(250);
        expect(
            foldPriceCents([
                { priceCents: 700, quantity: 2 },
                { priceCents: 400, quantity: 1 },
            ]),
        ).toBe(600);
    });

    it("keeps an unrecorded price unrecorded", () => {
        expect(
            foldPriceCents([
                { priceCents: null, quantity: 2 },
                { priceCents: undefined, quantity: 1 },
            ]),
        ).toBeNull();
        expect(foldPriceCents([])).toBeNull();
    });

    it("drops the remaining cents, the way the backend's integer division does", () => {
        expect(
            foldPriceCents([
                { priceCents: 1000, quantity: 1 },
                { priceCents: null, quantity: 2 },
            ]),
        ).toBe(333);
    });
});
