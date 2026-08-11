import { describe, expect, it } from "vitest";
import { computeCollectionStats, countPips, primaryType, priceOf } from "src/utils/collection-stats";
import type { Printing } from "src/utils/scryfall";
import type { CollectionEntryResponse } from "src/api/generated";

/**
 * Builds a printing with everything defaulted, so a test only states what it cares about
 *
 * @param overrides the fields under test
 *
 * @returns the printing
 */
function printing(overrides: Partial<Printing>): Printing {
    return {
        id: "id",
        name: "Card",
        setName: "Set",
        setCode: "SET",
        collectorNumber: "1",
        imageUrl: null,
        largeImageUrl: null,
        manaCost: "",
        typeLine: "",
        oracleText: "",
        rarity: "common",
        scryfallUrl: "",
        colorIdentity: [],
        manaValue: 0,
        releasedAt: "2020-01-01",
        artist: "",
        legalities: {},
        keywords: [],
        reserved: false,
        faces: [],
        priceEur: null,
        priceEurFoil: null,
        finishes: ["nonfoil"],
        ...overrides,
    };
}

/**
 * Builds a collection entry with everything defaulted
 *
 * @param overrides the fields under test
 *
 * @returns the entry
 */
function entry(overrides: Partial<CollectionEntryResponse>): CollectionEntryResponse {
    return {
        uuid: "entry",
        printing: "id",
        quantity: 1,
        condition: "NearMint",
        finish: "Nonfoil",
        created_at: "2024-01-15T10:00:00Z",
        ...overrides,
    };
}

describe("primaryType", () => {
    it("files a card under its most specific type", () => {
        expect(primaryType("Legendary Artifact Creature — Golem")).toBe("creature");
        expect(primaryType("Instant")).toBe("instant");
    });

    it("keeps artifact lands in the mana base", () => {
        expect(primaryType("Artifact Land")).toBe("land");
    });

    it("reads only the front of a two-faced card", () => {
        expect(primaryType("Sorcery // Creature — Human")).toBe("sorcery");
    });

    it("does not mistake a subtype for a card type", () => {
        // "Rogue" contains no card type, but a naive search over the whole line
        // would find "Land" inside "Landfall" and the like.
        expect(primaryType("Enchantment — Aura")).toBe("enchantment");
    });

    it("names the types of the side formats instead of lumping them", () => {
        expect(primaryType("Scheme")).toBe("scheme");
        expect(primaryType("Ongoing Scheme")).toBe("scheme");
        expect(primaryType("Conspiracy")).toBe("conspiracy");
        expect(primaryType("Dungeon")).toBe("dungeon");
        expect(primaryType("Phenomenon")).toBe("phenomenon");
        expect(primaryType("Plane — Zendikar")).toBe("plane");
        expect(primaryType("Vanguard")).toBe("vanguard");
    });

    it("does not read a planeswalker as a plane", () => {
        // The types are matched as substrings, so "Plane" has to stay behind
        // "Planeswalker" in the order — otherwise every walker files as a plane.
        expect(primaryType("Legendary Planeswalker — Jace")).toBe("planeswalker");
    });

    it("files a kindred card under the type it shares a line with", () => {
        // "Kindred" never stands alone, so it is not a bucket of its own.
        expect(primaryType("Kindred Sorcery — Elf")).toBe("sorcery");
    });

    it("still has somewhere to put what it cannot name", () => {
        expect(primaryType("Card")).toBe("other");
    });
});

describe("countPips", () => {
    it("counts a plain cost", () => {
        expect(countPips(printing({ manaCost: "{2}{U}{U}" }))).toEqual({ U: 2 });
    });

    it("counts a hybrid symbol for both of its colours", () => {
        expect(countPips(printing({ manaCost: "{W/U}" }))).toEqual({ W: 1, U: 1 });
    });

    it("ignores generic and colourless symbols", () => {
        expect(countPips(printing({ manaCost: "{3}{C}" }))).toEqual({});
    });

    it("adds up both halves of a split card", () => {
        const split = printing({
            manaCost: "{R} // {1}{R}",
            faces: [
                { name: "a", manaCost: "{R}", typeLine: "", oracleText: "" },
                { name: "b", manaCost: "{1}{R}", typeLine: "", oracleText: "" },
            ],
        });
        expect(countPips(split)).toEqual({ R: 2 });
    });
});

describe("priceOf", () => {
    const card = printing({ priceEur: 1, priceEurFoil: 9 });

    it("prices a foil stack as a foil", () => {
        expect(priceOf(entry({ finish: "Foil" }), card)).toBe(9);
    });

    it("prices everything else off the plain printing", () => {
        expect(priceOf(entry({ finish: "Nonfoil" }), card)).toBe(1);
        expect(priceOf(entry({ finish: "Etched" }), card)).toBe(1);
    });

    it("falls back when the foil is unpriced", () => {
        expect(priceOf(entry({ finish: "Foil" }), printing({ priceEur: 2 }))).toBe(2);
    });

    it("has no price for an unknown printing", () => {
        expect(priceOf(entry({}), undefined)).toBeNull();
    });
});

describe("computeCollectionStats", () => {
    it("weights every chart by copies", () => {
        const printings = new Map([
            ["id", printing({ typeLine: "Creature — Elf", manaValue: 2, colorIdentity: ["G"] })],
        ]);
        const stats = computeCollectionStats([entry({ quantity: 4 })], printings);

        expect(stats.totalCards).toBe(4);
        expect(stats.manaCurve.find((bucket) => bucket.key === "2")?.cards).toBe(4);
        expect(stats.colorIdentity.find((bucket) => bucket.key === "G")?.cards).toBe(4);
    });

    it("keeps lands out of the mana curve", () => {
        const printings = new Map([["id", printing({ typeLine: "Basic Land — Forest" })]]);
        const stats = computeCollectionStats([entry({ quantity: 10 })], printings);

        expect(stats.manaCurve.every((bucket) => bucket.cards === 0)).toBe(true);
        expect(stats.types.find((bucket) => bucket.key === "land")?.cards).toBe(10);
    });

    it("pools everything above the curve's cap", () => {
        const printings = new Map([["id", printing({ typeLine: "Creature", manaValue: 12 })]]);
        const stats = computeCollectionStats([entry({})], printings);

        expect(stats.manaCurve.find((bucket) => bucket.key === "7")?.cards).toBe(1);
    });

    it("still counts cards Scryfall no longer knows", () => {
        const stats = computeCollectionStats([entry({ quantity: 3 })], new Map());

        expect(stats.totalCards).toBe(3);
        expect(stats.marketValue).toBe(0);
        // ...but they land in no chart, rather than in a bucket that reads as real
        expect(stats.types.every((bucket) => bucket.cards === 0)).toBe(true);
    });

    it("compares what was paid only against the same cards", () => {
        const printings = new Map([
            ["cheap", printing({ id: "cheap", priceEur: 1 })],
            ["dear", printing({ id: "dear", priceEur: 100 })],
        ]);
        const stats = computeCollectionStats(
            [
                entry({ uuid: "a", printing: "cheap", purchase_price_cents: 200 }),
                // No purchase price: must not inflate the comparison
                entry({ uuid: "b", printing: "dear" }),
            ],
            printings,
        );

        expect(stats.marketValue).toBe(101);
        expect(stats.purchaseTotal).toBe(2);
        expect(stats.marketOfPurchased).toBe(1);
    });

    it("builds a cumulative timeline from the acquisition date", () => {
        const printings = new Map([["id", printing({ priceEur: 1 })]]);
        const stats = computeCollectionStats(
            [
                entry({ uuid: "a", acquired_at: "2024-03-04", quantity: 2 }),
                entry({ uuid: "b", acquired_at: "2024-01-31", quantity: 1 }),
                // No acquisition date — falls back to when it was filed
                entry({ uuid: "c", created_at: "2024-03-20T10:00:00Z", quantity: 5 }),
            ],
            printings,
        );

        expect(stats.timeline).toEqual([
            { month: "2024-01", cards: 1, value: 1 },
            { month: "2024-03", cards: 8, value: 8 },
        ]);
    });

    it("counts a card once per format it is legal in", () => {
        const printings = new Map([
            ["id", printing({ legalities: { modern: "legal", vintage: "restricted", standard: "not_legal" } })],
        ]);
        const stats = computeCollectionStats([entry({ quantity: 2 })], printings);

        expect(stats.formats.find((bucket) => bucket.key === "modern")?.cards).toBe(2);
        // Restricted is not legal — a Vintage deck may play one, not four
        expect(stats.formats.find((bucket) => bucket.key === "vintage")?.cards).toBe(0);
        expect(stats.formats.find((bucket) => bucket.key === "standard")?.cards).toBe(0);
    });
});
