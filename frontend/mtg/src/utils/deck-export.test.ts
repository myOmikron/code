import { describe, expect, it } from "vitest";
import type { DeckCardResponse, DeckZone } from "src/api/generated";
import { exportDecklist } from "src/utils/deck-export";
import { parseDecklist } from "src/utils/decklist";

/**
 * A slot, with only what a line is written from
 *
 * @param quantity how many copies
 * @param name the card's name
 * @param set the set code
 * @param number the collector number
 * @param zone which zone it sits in
 * @param foil whether the copies are foil
 * @param finishes what the printing was made in
 *
 * @returns the slot
 */
function slot(
    quantity: number,
    name: string,
    set: string,
    number: string,
    zone: DeckZone = "Main",
    foil = false,
    finishes: Array<string> = ["nonfoil", "foil"],
): DeckCardResponse {
    return {
        uuid: `${name}-${zone}`,
        printing: "printing",
        quantity,
        zone,
        foil,
        tags: [],
        card: { name, set_code: set, collector_number: number, finishes },
    } as unknown as DeckCardResponse;
}

describe("exportDecklist", () => {
    it("writes a section per zone, in the order a list is read", () => {
        const text = exportDecklist([
            slot(1, "Sol Ring", "LTR", "297"),
            slot(1, "Atraxa, Grand Unifier", "ONE", "459", "Commander"),
            slot(2, "Negate", "MOM", "62", "Side"),
        ]);

        expect(text).toBe(
            [
                "Commander",
                "1 Atraxa, Grand Unifier (ONE) 459",
                "",
                "Deck",
                "1 Sol Ring (LTR) 297",
                "",
                "Sideboard",
                "2 Negate (MOM) 62",
            ].join("\n"),
        );
    });

    it("marks the foils the way MTGO does", () => {
        expect(exportDecklist([slot(1, "Sol Ring", "LTR", "297", "Main", true)])).toContain("*F*");
        expect(exportDecklist([slot(1, "Mox Amber", "BRO", "1", "Main", true, ["etched"])])).toContain("*E*");
    });

    it("leaves out what the catalog does not know", () => {
        const unknown = { uuid: "u", printing: "p", quantity: 1, zone: "Main", foil: false, tags: [], card: null };
        expect(exportDecklist([unknown as unknown as DeckCardResponse])).toBe("");
    });

    it("comes back through the reader it was written for", () => {
        const cards = [
            slot(1, "Atraxa, Grand Unifier", "ONE", "459", "Commander"),
            slot(4, "Lightning Bolt", "2ED", "162"),
            slot(2, "Negate", "MOM", "62", "Side"),
        ];

        const read = parseDecklist(exportDecklist(cards));

        expect(read.rows).toHaveLength(3);
        expect(read.rows.map((row) => [row.quantity, row.name, row.setCode, row.collectorNumber, row.zone])).toEqual([
            [1, "Atraxa, Grand Unifier", "ONE", "459", "Commander"],
            [4, "Lightning Bolt", "2ED", "162", "Main"],
            [2, "Negate", "MOM", "62", "Side"],
        ]);
    });
});
