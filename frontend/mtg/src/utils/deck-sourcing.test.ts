import { describe, expect, it } from "vitest";
import type { LineDeviationResponse } from "src/api/generated";
import {
    countSlot,
    fills,
    groupByOrigin,
    missingCost,
    proxyToggle,
    sourcingOffers,
    stacksOffTheList,
} from "src/utils/deck-sourcing";
import type {
    CandidateStackLike,
    DeckEntryLike,
    FiledStackLike,
    SourcingMatch,
    SourcingSlotLike,
    SourcingStackLike,
} from "src/utils/deck-sourcing";

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

    it("takes an etched copy for neither a plain nor a foil slot while the switch is on", () => {
        const etched = stack({ finish: "Etched" });

        expect(fills(slot(), etched, STRICT)).toBe(false);
        expect(fills(slot({ foil: true }), etched, STRICT)).toBe(false);
        expect(fills(slot(), etched, { exactPrinting: true, matchFinish: false })).toBe(true);
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

    it("counts another printing and finish as available once the switches are off", () => {
        const elsewhere = [stack({ printing: "print-b", finish: "Foil", quantity: 2 })];

        expect(countSlot(slot({ quantity: 2 }), [], elsewhere, STRICT)).toMatchObject({ available: 0, missing: 2 });
        expect(countSlot(slot({ quantity: 2 }), [], elsewhere, WIDE)).toMatchObject({ available: 2, missing: 0 });
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

describe("stacks off the list", () => {
    it("keeps out every stack a line asks for, in any printing or finish, Proxies too", () => {
        const filed = [stack(), stack({ printing: "print-b", finish: "Foil" }), { ...stack(), proxy: true }];

        expect(stacksOffTheList(filed, [slot()])).toEqual([]);
    });

    it("lists the real cards and the Proxies of a card no line names", () => {
        const crypt = stack({ printing: "print-c", card: { oracle_id: "mana-crypt" } });
        const proxy = { ...crypt, proxy: true };

        expect(stacksOffTheList([stack(), crypt, proxy], [slot()])).toEqual([crypt, proxy]);
    });

    it("falls back to the printing when the catalog does not know the card", () => {
        const known = stack({ card: null });
        const unknown = stack({ printing: "print-b", card: null });

        expect(stacksOffTheList([known, unknown], [slot({ card: null })])).toEqual([unknown]);
    });

    it("lists everything for a deck whose list names nothing", () => {
        expect(stacksOffTheList([stack()], [])).toEqual([stack()]);
    });
});

describe("pricing the missing copies", () => {
    const priced = { oracle_id: "sol-ring", price_eur_cents: 150, price_eur_foil_cents: 900 };

    it("prices every copy still to buy at the price of the printing and finish the line asks for", () => {
        const rows = [
            { slot: slot({ card: priced }), count: { missing: 2 } },
            { slot: slot({ foil: true, card: priced }), count: { missing: 1 } },
        ];

        expect(missingCost(rows)).toBe(1200);
    });

    it("counts nothing for a line with nothing missing or without a price", () => {
        const rows = [
            { slot: slot({ card: priced }), count: { missing: 0 } },
            { slot: slot({ card: { oracle_id: "mana-crypt" } }), count: { missing: 3 } },
        ];

        expect(missingCost(rows)).toBe(0);
    });

    it("falls back to the plain price for a foil line without a foil price", () => {
        const plain = { oracle_id: "sol-ring", price_eur_cents: 150 };
        const rows = [{ slot: slot({ foil: true, card: plain }), count: { missing: 2 } }];

        expect(missingCost(rows)).toBe(300);
    });
});

/**
 * A Deck entry of the main deck asking for two plain copies
 *
 * @param over what to change about the usual entry
 *
 * @returns the entry
 */
function entry(over: Partial<DeckEntryLike> = {}): DeckEntryLike {
    return { ...slot({ quantity: 2 }), zone: "Main", ...over };
}

/**
 * What the Physical deck holds for the entry, nothing unless said
 *
 * @param over the fields that differ
 *
 * @returns the line
 */
function line(over: Partial<LineDeviationResponse> = {}): LineDeviationResponse {
    return { entry: "entry", in_deck: 0, proxies: 0, other_printing: [], missing: 0, surplus: 0, ...over };
}

/**
 * A stack lying in the Physical deck
 *
 * @param uuid what it is called
 * @param over what to change about the usual stack
 *
 * @returns the stack
 */
function filed(uuid: string, over: Partial<FiledStackLike> = {}): FiledStackLike & { uuid: string } {
    return { uuid, ...stack(), proxy: false, ...over };
}

describe("what X does to a line", () => {
    it("puts Proxies in for every copy of a deck without a Physical deck", () => {
        expect(proxyToggle(entry(), undefined, [])).toEqual({ kind: "put", quantity: 2 });
    });

    it("puts Proxies in for the copies a line is missing", () => {
        const real = filed("real");

        expect(proxyToggle(entry(), line({ in_deck: 1, missing: 1 }), [real])).toEqual({ kind: "put", quantity: 1 });
    });

    it("fills the gap first on a line holding Proxies and still missing copies", () => {
        const proxies = filed("proxies", { proxy: true });

        expect(proxyToggle(entry(), line({ in_deck: 1, proxies: 1, missing: 1 }), [proxies])).toEqual({
            kind: "put",
            quantity: 1,
        });
    });

    it("throws the Proxies of a fully proxied line away again", () => {
        const proxies = filed("proxies", { proxy: true, quantity: 2 });

        expect(proxyToggle(entry(), line({ in_deck: 2, proxies: 2 }), [proxies])).toEqual({
            kind: "discard",
            quantity: 2,
            stacks: [{ stack: proxies, quantity: 2 }],
        });
    });

    it("throws only the Proxies of a line beside real copies away, and only its share of a stack", () => {
        const real = filed("real");
        const elsewhere = filed("elsewhere", { proxy: true, printing: "print-b", quantity: 3 });
        const proxies = filed("proxies", { proxy: true, quantity: 3 });

        expect(proxyToggle(entry(), line({ in_deck: 2, proxies: 1 }), [real, elsewhere, proxies])).toEqual({
            kind: "discard",
            quantity: 1,
            stacks: [{ stack: proxies, quantity: 1 }],
        });
    });

    it("throws Proxies of another printing standing in for the line away too", () => {
        const other = filed("other", { proxy: true, printing: "print-b", finish: "Foil" });
        const deviation = line({
            in_deck: 1,
            proxies: 1,
            other_printing: [{ printing: "print-b", finish: "Foil", quantity: 1, proxy: true }],
        });
        const proxies = filed("proxies", { proxy: true });

        expect(proxyToggle(entry(), deviation, [other, proxies])).toEqual({
            kind: "discard",
            quantity: 2,
            stacks: [
                { stack: proxies, quantity: 1 },
                { stack: other, quantity: 1 },
            ],
        });
    });

    it("does nothing to a line held only by real copies", () => {
        expect(proxyToggle(entry(), line({ in_deck: 2 }), [filed("real", { quantity: 2 })])).toBeNull();
    });

    it("does nothing on the maybe board", () => {
        expect(proxyToggle(entry({ zone: "Maybe" }), undefined, [])).toBeNull();
    });
});

/**
 * A stack on the shelf of one of the owner's collections
 *
 * @param uuid what it is called
 * @param over what to change about the usual stack
 *
 * @returns the stack
 */
function shelf(uuid: string, over: Partial<CandidateStackLike> = {}): CandidateStackLike & { uuid: string } {
    return { uuid, ...stack({ quantity: 4 }), collection_deck: null, ...over };
}

describe("what Besorgen offers for a line", () => {
    const exact = shelf("exact", { quantity: 1 });
    const otherPrinting = shelf("other-printing", { printing: "print-b" });
    const otherFinish = shelf("other-finish", { finish: "Foil" });
    const otherCard = shelf("other-card", { printing: "print-c", card: { oracle_id: "mana-crypt" } });
    const otherDeck = shelf("other-deck", { collection_deck: "deck-b" });
    const candidates = [otherPrinting, otherCard, exact, otherDeck, otherFinish];

    it("offers nothing on the maybe board", () => {
        expect(sourcingOffers(entry({ zone: "Maybe" }), undefined, [], candidates)).toEqual([]);
    });

    it("offers the exact stacks, then the other printings and finishes, then buying, then Proxies for a missing line", () => {
        expect(sourcingOffers(entry(), line({ missing: 2 }), [], candidates)).toEqual([
            { kind: "take", candidate: exact, quantity: 1, exact: true },
            { kind: "take", candidate: otherPrinting, quantity: 2, exact: false },
            { kind: "take", candidate: otherFinish, quantity: 2, exact: false },
            { kind: "bought", quantity: 2 },
            { kind: "proxy", toggle: { kind: "put", quantity: 2 } },
        ]);
    });

    it("offers every copy of a deck without a Physical deck", () => {
        const offers = sourcingOffers(entry(), undefined, [], [exact]);

        expect(offers).toEqual([
            { kind: "take", candidate: exact, quantity: 1, exact: true },
            { kind: "bought", quantity: 2 },
            { kind: "proxy", toggle: { kind: "put", quantity: 2 } },
        ]);
    });

    it("offers only to return the real copies of a line the deck holds for real", () => {
        const real = filed("real", { quantity: 2 });

        expect(sourcingOffers(entry(), line({ in_deck: 2 }), [real], candidates)).toEqual([
            { kind: "return", stack: real, quantity: 2 },
        ]);
    });

    it("offers to throw Proxies away, to replace them, and to return the real copies beside them", () => {
        const real = filed("real");
        const proxies = filed("proxies", { proxy: true });

        expect(sourcingOffers(entry(), line({ in_deck: 2, proxies: 1 }), [real, proxies], candidates)).toEqual([
            { kind: "proxy", toggle: { kind: "discard", quantity: 1, stacks: [{ stack: proxies, quantity: 1 }] } },
            { kind: "replace", proxy: proxies, candidate: exact, quantity: 1, exact: true },
            { kind: "replace", proxy: proxies, candidate: otherPrinting, quantity: 1, exact: false },
            { kind: "replace", proxy: proxies, candidate: otherFinish, quantity: 1, exact: false },
            { kind: "return", stack: real, quantity: 1 },
        ]);
    });

    it("offers no replacement without a copy on the shelf, and no return without a real copy", () => {
        const proxies = filed("proxies", { proxy: true, quantity: 2 });

        expect(sourcingOffers(entry(), line({ in_deck: 2, proxies: 2 }), [proxies], [otherCard, otherDeck])).toEqual([
            { kind: "proxy", toggle: { kind: "discard", quantity: 2, stacks: [{ stack: proxies, quantity: 2 }] } },
        ]);
    });

    it("returns real copies of another printing standing in for the line too", () => {
        const other = filed("other", { printing: "print-b" });
        const deviation = line({
            in_deck: 1,
            other_printing: [{ printing: "print-b", finish: "Nonfoil", quantity: 1, proxy: false }],
        });
        const real = filed("real");

        expect(sourcingOffers(entry(), deviation, [other, real], [])).toEqual([
            { kind: "return", stack: real, quantity: 1 },
            { kind: "return", stack: other, quantity: 1 },
        ]);
    });
});
