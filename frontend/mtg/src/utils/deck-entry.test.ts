import { describe, expect, it } from "vitest";
import type { DeckCardResponse, DeckZone } from "src/api/generated";
import { zoneEntryOf } from "src/utils/deck-entry";
import type { Printing } from "src/utils/scryfall";

/**
 * A Deck entry, with only what the lookup reads
 *
 * @param uuid tells the entry apart
 * @param zone where it lies
 * @param printing which printing it holds
 * @param name the card's name
 *
 * @returns the entry
 */
function entry(uuid: string, zone: DeckZone, printing: string, name: string) {
    return { uuid, zone, printing, quantity: 1, card: { name } } as unknown as DeckCardResponse;
}

/**
 * A search hit, with only what the lookup reads
 *
 * @param id the printing's id
 * @param name the card's name
 *
 * @returns the hit
 */
function hit(id: string, name: string) {
    return { id, name } as unknown as Printing;
}

describe("zoneEntryOf", () => {
    it("finds the entry holding the same card in another printing", () => {
        const entries = [entry("bolt-m10", "Main", "m10", "Lightning Bolt")];

        expect(zoneEntryOf(entries, "Main", hit("2xm", "Lightning Bolt"))?.uuid).toBe("bolt-m10");
    });

    it("takes the entry of the identical printing over another printing of the card", () => {
        const entries = [
            entry("bolt-m10", "Main", "m10", "Lightning Bolt"),
            entry("bolt-2xm", "Main", "2xm", "Lightning Bolt"),
        ];

        expect(zoneEntryOf(entries, "Main", hit("2xm", "Lightning Bolt"))?.uuid).toBe("bolt-2xm");
    });

    it("ignores the card in other zones", () => {
        const entries = [entry("bolt-side", "Side", "m10", "Lightning Bolt")];

        expect(zoneEntryOf(entries, "Main", hit("2xm", "Lightning Bolt"))).toBeUndefined();
    });
});
