import { describe, expect, test } from "vitest";
import { DeckCardResponse } from "src/api/generated";
import { advisorDeck, advisorSignature, bracketSpeed } from "src/utils/deck-advisor";

/**
 * Builds the smallest slot the projection can read.
 *
 * @param zone where the slot sits
 * @param oracle the card's oracle id, or none for a printing the catalog does not know
 * @param quantity how many copies
 * @param printing the printing id, defaulting to the oracle id
 * @param name the card's name, defaulting to the oracle id
 *
 * @returns the slot
 */
function slot(zone: string, oracle: string | null, quantity = 1, printing?: string, name?: string): DeckCardResponse {
    return {
        card: oracle === null ? null : ({ oracle_id: oracle, name: name ?? oracle } as DeckCardResponse["card"]),
        foil: false,
        printing: printing ?? oracle ?? "unknown",
        quantity,
        tags: [],
        uuid: `${printing ?? oracle}-${zone}`,
        zone: zone as DeckCardResponse["zone"],
    };
}

describe("advisorDeck", () => {
    test("folds printings of the same card into one entry", () => {
        const deck = advisorDeck([slot("Main", "aaa", 2, "p1"), slot("Main", "aaa", 1, "p2")]);
        expect(deck.entries).toEqual([{ oracle_id: "aaa", qty: 3 }]);
    });

    test("reads only the mainboard and the command zone", () => {
        const deck = advisorDeck([
            slot("Main", "aaa"),
            slot("Side", "bbb"),
            slot("Maybe", "ccc"),
            slot("Commander", "ddd"),
        ]);
        expect(deck.entries.map((entry) => entry.oracle_id)).toEqual(["aaa", "ddd"]);
        expect(deck.commander).toBe("ddd");
    });

    test("anchors a Partner deck on the first commander", () => {
        const deck = advisorDeck([slot("Commander", "aaa"), slot("Commander", "bbb")]);
        expect(deck.commander).toBe("aaa");
    });

    test("counts copies the catalog cannot identify instead of dropping them silently", () => {
        const deck = advisorDeck([slot("Main", null, 2), slot("Main", "aaa")]);
        expect(deck.unknown).toBe(2);
        expect(deck.entries).toEqual([{ oracle_id: "aaa", qty: 1 }]);
    });
});

describe("advisorSignature", () => {
    test("is indifferent to slot order and printing choice", () => {
        const one = advisorDeck([slot("Main", "aaa", 1, "p1"), slot("Main", "bbb")]);
        const other = advisorDeck([slot("Main", "bbb"), slot("Main", "aaa", 1, "p2")]);
        expect(advisorSignature(one, 0.5)).toBe(advisorSignature(other, 0.5));
    });

    test("changes with copies, commander and speed", () => {
        const base = advisorDeck([slot("Main", "aaa")]);
        const signature = advisorSignature(base, 0.5);
        expect(advisorSignature(advisorDeck([slot("Main", "aaa", 2)]), 0.5)).not.toBe(signature);
        expect(advisorSignature(advisorDeck([slot("Main", "aaa"), slot("Commander", "bbb")]), 0.5)).not.toBe(signature);
        expect(advisorSignature(base, 0.75)).not.toBe(signature);
    });

    test("is indifferent to card names", () => {
        const one = advisorDeck([slot("Main", "aaa", 1, "p1", "Sol Ring")]);
        const other = advisorDeck([slot("Main", "aaa", 1, "p1", "Some Other Name")]);
        expect(advisorSignature(one, 0.5)).toBe(advisorSignature(other, 0.5));
    });
});

describe("bracketSpeed", () => {
    test("spreads the five brackets over the unit interval", () => {
        expect(bracketSpeed(1)).toBe(0);
        expect(bracketSpeed(3)).toBe(0.5);
        expect(bracketSpeed(5)).toBe(1);
    });

    test("reads an unclaimed bracket at the middle", () => {
        expect(bracketSpeed(null)).toBe(0.5);
        expect(bracketSpeed(undefined)).toBe(0.5);
    });
});
