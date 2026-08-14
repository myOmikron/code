import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cardmarketUrl } from "src/utils/cardmarket";
import type { CardmarketSettings } from "src/utils/cardmarket";

/** A German printing the catalog knows a product id for */
const CARD = {
    name: "Vorinclex, Monstrous Raider",
    cardmarket_id: 559712,
    lang: "de",
};

/**
 * The defaults with a few fields replaced
 *
 * @param overrides what to change
 *
 * @returns the settings
 */
function settings(overrides: Partial<CardmarketSettings> = {}): CardmarketSettings {
    return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("cardmarketUrl", () => {
    it("points at the product on the chosen country page", () => {
        const url = cardmarketUrl(CARD, null, settings({ matchLanguage: false, region: "en" }));
        expect(url).toBe("https://www.cardmarket.com/en/Magic/Products?idProduct=559712");
    });

    it("filters by the printing's own language", () => {
        const url = new URL(cardmarketUrl(CARD, null, settings()));
        expect(url.searchParams.get("language")).toBe("3");
    });

    it("leaves the language filter off for a language Cardmarket does not grade", () => {
        const url = new URL(cardmarketUrl({ ...CARD, lang: "qya" }, null, settings()));
        expect(url.searchParams.get("language")).toBeNull();
    });

    it("carries the stack's finish, etched counting as foil", () => {
        expect(new URL(cardmarketUrl(CARD, "Nonfoil", settings())).searchParams.get("isFoil")).toBe("N");
        expect(new URL(cardmarketUrl(CARD, "Foil", settings())).searchParams.get("isFoil")).toBe("Y");
        expect(new URL(cardmarketUrl(CARD, "Etched", settings())).searchParams.get("isFoil")).toBe("Y");
    });

    it("leaves the finish out when the setting is off, or no stack is meant", () => {
        expect(new URL(cardmarketUrl(CARD, "Foil", settings({ matchFinish: false }))).searchParams.get("isFoil")).toBe(
            null,
        );
        expect(new URL(cardmarketUrl(CARD, null, settings())).searchParams.get("isFoil")).toBeNull();
    });

    it("carries the minimum condition and the seller country", () => {
        const url = new URL(cardmarketUrl(CARD, null, settings({ minCondition: "Excellent", sellerCountry: 7 })));
        expect(url.searchParams.get("minCondition")).toBe("3");
        expect(url.searchParams.get("sellerCountry")).toBe("7");
    });

    it("searches for the name when the catalog knows no product", () => {
        const url = new URL(
            cardmarketUrl({ ...CARD, cardmarket_id: null }, "Foil", settings({ minCondition: "Mint" })),
        );
        expect(url.pathname).toBe("/de/Magic/Products/Search");
        expect(url.searchParams.get("searchString")).toBe("Vorinclex, Monstrous Raider");
        // A search takes none of the offer filters, see `cardmarketUrl`
        expect(url.searchParams.get("minCondition")).toBeNull();
        expect(url.searchParams.get("isFoil")).toBeNull();
    });
});
