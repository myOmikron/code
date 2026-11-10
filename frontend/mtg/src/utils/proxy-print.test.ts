import { describe, expect, it } from "vitest";
import {
    deckProxyCards,
    isBasicLand,
    MAX_COPIES,
    missingProxyCards,
    PER_SHEET,
    printableImage,
    proxyFaces,
    proxySheets,
} from "src/utils/proxy-print";
import type { ProxyCard } from "src/utils/proxy-print";
import type { DeckCardResponse, DeckDeviationResponse, DeckZone, LineDeviationResponse } from "src/api/generated";

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
        set: "LEB",
        number: "161",
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

/**
 * One slot of a deck
 *
 * @param name the card's name, empty for a slot the catalog has not caught up with
 * @param zone which zone the slot sits in
 * @param quantity how many copies it holds
 * @param foil whether the slot asks for foils
 *
 * @returns the slot
 */
function slot(name: string, zone: DeckZone, quantity = 1, foil = false): DeckCardResponse {
    return {
        uuid: `${zone}-${name}-${foil ? "foil" : "plain"}`,
        printing: `printing-${name}`,
        quantity,
        zone,
        foil,
        proxy: false,
        tags: [],
        card:
            name === ""
                ? null
                : {
                      name,
                      set_code: "LEB",
                      collector_number: "161",
                      type_line: "Artifact",
                      image_normal: `https://cards.scryfall.io/normal/front/a/b/${name}.jpg`,
                      image_back_normal: null,
                      cardmarket_id: null,
                      color_identity: "",
                      extra_turns: false,
                      finishes: ["nonfoil"],
                      game_changer: false,
                      image_back_small: null,
                      image_small: null,
                      lang: "en",
                      legal_formats: [],
                      mana_cost: "{1}",
                      mana_value: 1,
                      mass_land_denial: false,
                      oracle_id: null,
                      price_eur_cents: null,
                      price_eur_foil_cents: null,
                      produced_mana: [],
                      rarity: "Common",
                      reserved: false,
                      set_name: "Limited Edition Beta",
                  },
    };
}

describe("deckProxyCards", () => {
    it("takes what the deck plays and leaves the rest", () => {
        const cards = [
            slot("Sol Ring", "Main"),
            slot("Kenrith", "Commander"),
            slot("Duress", "Side"),
            slot("Ponder", "Maybe"),
        ];

        expect(deckProxyCards(cards).map((card) => card.name)).toStrictEqual(["Sol Ring", "Kenrith"]);
    });

    it("carries the print over, for a list that names it", () => {
        expect(deckProxyCards([slot("Sol Ring", "Main")])[0]).toMatchObject({ set: "LEB", number: "161" });
    });

    it("keeps a slot the catalog has not caught up with", () => {
        const [card] = deckProxyCards([slot("", "Main")]);

        expect(card).toMatchObject({ name: "", set: "", number: "", front: null });
    });

    it("holds a slot to what a list takes", () => {
        expect(deckProxyCards([slot("Sol Ring", "Main", MAX_COPIES + 5)])[0]?.copies).toBe(MAX_COPIES);
    });
});

/**
 * A Deviation answer for a deck with a Physical deck
 *
 * @param entries what the Physical deck holds for each Deck entry
 *
 * @returns the answer as the service would send it
 */
function deviation(entries: Array<LineDeviationResponse>): DeckDeviationResponse {
    return { has_physical_deck: true, entries, not_on_list: [] };
}

/**
 * A Deck entry the Physical deck lacks copies of
 *
 * @param entry the Deck entry, as {@link slot} names it
 * @param missing how many copies are missing
 *
 * @returns the line
 */
function lacking(entry: string, missing: number): LineDeviationResponse {
    return { entry, in_deck: 0, proxies: 0, other_printing: [], missing, surplus: 0 };
}

describe("missingProxyCards", () => {
    it("offers only the copies the Physical deck does not hold", () => {
        const cards = [slot("Sol Ring", "Main"), slot("Swamp", "Main", 10)];

        const missing = missingProxyCards(cards, deviation([lacking("Main-Swamp-plain", 4)]));

        expect(missing?.map((card) => [card.name, card.copies])).toStrictEqual([["Swamp", 4]]);
    });

    it("has nothing to tell for a deck without a Physical deck", () => {
        const none = { ...deviation([]), has_physical_deck: false };

        expect(missingProxyCards([slot("Sol Ring", "Main")], none)).toBeNull();
    });

    it("reads each Deck entry's own missing copies", () => {
        const cards = [slot("Sol Ring", "Main", 1, true), slot("Sol Ring", "Commander", 1)];

        const missing = missingProxyCards(
            cards,
            deviation([lacking("Main-Sol Ring-foil", 0), lacking("Commander-Sol Ring-plain", 1)]),
        );

        expect(missing?.map((card) => card.key)).toStrictEqual(["Commander-Sol Ring-plain"]);
    });

    it("leaves out the sideboard and the maybe board, as the whole deck does", () => {
        const cards = [slot("Duress", "Side"), slot("Ponder", "Maybe")];

        const missing = missingProxyCards(cards, deviation([lacking("Side-Duress-plain", 1)]));

        expect(missing).toStrictEqual([]);
    });
});
