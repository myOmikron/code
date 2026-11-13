import { describe, expect, it } from "vitest";
import type { DeckCardResponse } from "src/api/generated";
import { canFoil, finishOf, onlyFoil, priceOf } from "src/utils/deck-foil";

/**
 * A slot, with only what the finish reads
 *
 * @param foil what the owner ticked
 * @param finishes what the printing was made in
 * @param prices the ordinary and the foil price in cents
 *
 * @returns the slot
 */
function slot(foil: boolean, finishes: Array<string>, prices: [number | null, number | null] = [100, 500]) {
    return {
        uuid: "slot",
        printing: "printing",
        quantity: 1,
        zone: "Main",
        foil,
        tags: [],
        card: { finishes, price_eur_cents: prices[0], price_eur_foil_cents: prices[1] },
    } as unknown as DeckCardResponse;
}

describe("deck foil", () => {
    it("leaves an ordinary card ordinary", () => {
        const card = slot(false, ["nonfoil", "foil"]);
        expect(finishOf(card)).toBe("Nonfoil");
        expect(priceOf(card)).toBe(100);
    });

    it("puts the sheen on what was ticked", () => {
        const card = slot(true, ["nonfoil", "foil"]);
        expect(finishOf(card)).toBe("Foil");
        expect(priceOf(card)).toBe(500);
    });

    it("reads a foil-only printing as foil without being told", () => {
        const card = slot(false, ["foil"]);
        expect(onlyFoil(card)).toBe(true);
        expect(finishOf(card)).toBe("Foil");
        expect(priceOf(card)).toBe(500);
    });

    it("knows an etched card from a traditional one", () => {
        expect(finishOf(slot(true, ["nonfoil", "etched"]))).toBe("Etched");
    });

    it("refuses a sheen that was never printed", () => {
        const card = slot(true, ["nonfoil"]);
        expect(canFoil(card)).toBe(false);
        expect(finishOf(card)).toBe("Nonfoil");
    });

    it("falls back to the ordinary price when no foil price is on file", () => {
        expect(priceOf(slot(true, ["foil"], [100, null]))).toBe(100);
    });
});
