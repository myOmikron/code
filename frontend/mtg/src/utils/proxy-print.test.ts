import { describe, expect, it } from "vitest";
import { isBasicLand, PER_SHEET, printableImage, proxyFaces, proxySheets } from "src/utils/proxy-print";
import type { ProxyCard } from "src/utils/proxy-print";

/**
 * A card to print
 *
 * @param key what tells it apart
 * @param copies how many are wanted
 * @param back whether it was photographed twice
 * @param basic whether it is a basic land
 *
 * @returns the card
 */
function card(key: string, copies: number, back = false, basic = false): ProxyCard {
    return {
        key,
        name: key,
        front: `https://cards.scryfall.io/normal/front/a/b/${key}.jpg`,
        back: back ? `https://cards.scryfall.io/normal/back/a/b/${key}.jpg` : null,
        copies,
        basic,
    };
}

describe("proxyFaces", () => {
    it("prints one picture per copy", () => {
        expect(proxyFaces([card("sol-ring", 3)], true, false)).toHaveLength(3);
    });

    it("keeps a card's two sides next to each other", () => {
        const faces = proxyFaces([card("delver", 2, true)], true, false);

        expect(faces.map((face) => face.back)).toStrictEqual([false, true, false, true]);
    });

    it("leaves the backs off when they are not wanted", () => {
        const faces = proxyFaces([card("delver", 2, true)], false, false);

        expect(faces.map((face) => face.back)).toStrictEqual([false, false]);
    });

    it("leaves the basic lands off when they are not wanted", () => {
        const cards = [card("island", 4, false, true), card("sol-ring", 1)];

        expect(proxyFaces(cards, true, true).map((face) => face.name)).toStrictEqual(["sol-ring"]);
        expect(proxyFaces(cards, true, false)).toHaveLength(5);
    });

    it("skips a card the catalog has no picture of", () => {
        expect(proxyFaces([{ ...card("ghost", 2), front: null }], true, false)).toStrictEqual([]);
    });
});

describe("proxySheets", () => {
    it("fills a sheet before starting the next", () => {
        const sheets = proxySheets(proxyFaces([card("island", PER_SHEET + 1)], false, false));

        expect(sheets).toHaveLength(2);
        expect(sheets[0]).toHaveLength(PER_SHEET);
        expect(sheets[1]).toHaveLength(1);
    });

    it("has nothing to print for nothing picked", () => {
        expect(proxySheets([])).toStrictEqual([]);
    });
});

describe("isBasicLand", () => {
    it("knows the basics, snow and colourless included", () => {
        expect(isBasicLand("Basic Land — Island")).toBe(true);
        expect(isBasicLand("Basic Snow Land — Forest")).toBe(true);
        expect(isBasicLand("Basic Land")).toBe(true);
    });

    it("leaves the rest alone", () => {
        expect(isBasicLand("Land — Island")).toBe(false);
        expect(isBasicLand("Legendary Creature — Merfolk")).toBe(false);
        expect(isBasicLand(null)).toBe(false);
    });
});

describe("printableImage", () => {
    it("asks for the size worth printing", () => {
        expect(printableImage("https://cards.scryfall.io/normal/front/a/b/id.jpg")).toBe(
            "https://cards.scryfall.io/large/front/a/b/id.jpg",
        );
    });

    it("leaves a picture from anywhere else alone", () => {
        expect(printableImage("https://example.com/normal/card.jpg")).toBe("https://example.com/normal/card.jpg");
    });

    it("has nothing to print without a picture", () => {
        expect(printableImage(null)).toBeNull();
        expect(printableImage("")).toBeNull();
    });
});
