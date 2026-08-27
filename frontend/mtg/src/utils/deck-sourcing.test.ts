import { describe, expect, it } from "vitest";
import { countSlot, fills, groupByOrigin } from "src/utils/deck-sourcing";
import type { SourcingMatch, SourcingSlotLike, SourcingStackLike } from "src/utils/deck-sourcing";

const STRICT: SourcingMatch = { exactPrinting: true, matchFinish: true };
const WIDE: SourcingMatch = { exactPrinting: false, matchFinish: false };

/**
 * A deck slot asking for a card
 *
 * @param over what to change about the usual slot
 *
 * @returns the slot
 */
function slot(over: Partial<SourcingSlotLike> = {}): SourcingSlotLike {
    return { printing: "print-a", quantity: 1, foil: false, card: { oracle_id: "sol-ring" }, ...over };
}

/**
 * A stack of cards lying somewhere
 *
 * @param over what to change about the usual stack
 *
 * @returns the stack
 */
function stack(over: Partial<SourcingStackLike> = {}): SourcingStackLike {
    return { printing: "print-a", quantity: 1, finish: "Nonfoil", card: { oracle_id: "sol-ring" }, ...over };
}

describe("filling a slot", () => {
    it("takes the very printing under either rule", () => {
        expect(fills(slot(), stack(), STRICT)).toBe(true);
        expect(fills(slot(), stack(), WIDE)).toBe(true);
    });

    it("takes another edition of the same card only when allowed to", () => {
        const other = stack({ printing: "print-b" });

        expect(fills(slot(), other, STRICT)).toBe(false);
        expect(fills(slot(), other, WIDE)).toBe(true);
    });

    it("never takes a different card", () => {
        const wrong = stack({ printing: "print-b", card: { oracle_id: "mana-crypt" } });

        expect(fills(slot(), wrong, WIDE)).toBe(false);
    });

    it("falls back to the printing when the catalog knows neither side", () => {
        const unknown = stack({ card: null });

        expect(fills(slot({ card: null }), unknown, WIDE)).toBe(true);
        expect(fills(slot({ card: null }), stack({ printing: "print-b", card: null }), WIDE)).toBe(false);
    });

    it("keeps foil apart from plain while the switch is on", () => {
        const foil = stack({ finish: "Foil" });

        expect(fills(slot(), foil, STRICT)).toBe(false);
        expect(fills(slot({ foil: true }), foil, STRICT)).toBe(true);
        expect(fills(slot(), foil, { exactPrinting: true, matchFinish: false })).toBe(true);
    });
});

describe("counting a slot", () => {
    it("counts what is in the deck and what could still be taken", () => {
        const count = countSlot(slot({ quantity: 4 }), [stack({ quantity: 1 })], [stack({ quantity: 2 })], STRICT);

        expect(count).toMatchObject({ needed: 4, filed: 1, available: 2, missing: 1 });
    });

    it("never counts more in the deck than the list asks for", () => {
        const count = countSlot(slot({ quantity: 1 }), [stack({ quantity: 3 })], [], STRICT);

        expect(count.filed).toBe(1);
        expect(count.missing).toBe(0);
    });

    it("reports copies the printing switch is turning away", () => {
        const elsewhere = [stack({ printing: "print-b", quantity: 2 })];
        const count = countSlot(slot({ quantity: 4 }), [], elsewhere, STRICT);

        expect(count.available).toBe(0);
        expect(count.otherPrinting).toBe(2);
        expect(count.missing).toBe(4);
    });

    it("reports copies the finish switch is turning away", () => {
        const elsewhere = [stack({ finish: "Foil", quantity: 3 })];
        const count = countSlot(slot({ quantity: 2 }), [], elsewhere, STRICT);

        expect(count.available).toBe(0);
        expect(count.otherFinish).toBe(3);
    });

    it("says nothing is being turned away once the switches are off", () => {
        const elsewhere = [stack({ printing: "print-b", finish: "Foil", quantity: 2 })];
        const count = countSlot(slot({ quantity: 2 }), [], elsewhere, WIDE);

        expect(count).toMatchObject({ available: 2, otherPrinting: 0, otherFinish: 0, missing: 0 });
    });
});

describe("grouping what is in a deck", () => {
    /**
     * A stack as the sourcing view hands it over
     *
     * @param name the card's printed name, empty for a printing the catalog misses
     * @param origin the collection it came out of
     * @param setCode the set it was printed in
     *
     * @returns the stack
     */
    function stack(name: string, origin: string | null, setCode = "LTR") {
        return {
            origin,
            origin_name: origin === null ? null : `Box ${origin}`,
            card: name === "" ? null : { name, set_code: setCode, collector_number: "1" },
        };
    }

    it("puts the cards of every collection in reading order", () => {
        const groups = groupByOrigin([
            stack("Sol Ring", "a"),
            stack("Arcane Signet", "a"),
            stack("Command Tower", "a"),
        ]);

        expect(groups[0]?.stacks.map((entry) => entry.card?.name)).toEqual([
            "Arcane Signet",
            "Command Tower",
            "Sol Ring",
        ]);
    });

    it("keeps the collections apart and the homeless cards last", () => {
        const groups = groupByOrigin([stack("Sol Ring", null), stack("Arcane Signet", "b"), stack("Swamp", "a")]);

        expect(groups.map((group) => group.origin)).toEqual(["a", "b", null]);
    });

    it("orders two prints of one card by set and number", () => {
        const groups = groupByOrigin([stack("Sol Ring", "a", "M10"), stack("Sol Ring", "a", "C21")]);

        expect(groups[0]?.stacks.map((entry) => entry.card?.set_code)).toEqual(["C21", "M10"]);
    });

    it("sends a printing the catalog does not know to the end", () => {
        const groups = groupByOrigin([stack("", "a"), stack("Sol Ring", "a")]);

        expect(groups[0]?.stacks.map((entry) => entry.card?.name ?? null)).toEqual(["Sol Ring", null]);
    });
});
