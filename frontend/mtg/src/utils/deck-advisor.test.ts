import { describe, expect, test } from "vitest";
import { DeckCardResponse } from "src/api/generated";
import { CutCandidate, Suggestion, SuggestionGroup, SuggestionReport, Swap } from "src/api/graph-generated";
import {
    advisorDeck,
    advisorSignature,
    bracketSpeed,
    filterReport,
    filterSwaps,
    suggestionAddQuantity,
} from "src/utils/deck-advisor";

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

    test("names every commander in zone order, once each", () => {
        const deck = advisorDeck([
            slot("Commander", "aaa"),
            slot("Main", "ccc"),
            slot("Commander", "bbb"),
            slot("Commander", "aaa", 1, "p2"),
        ]);
        expect(deck.commanders).toEqual(["aaa", "bbb"]);
        expect(deck.commander).toBe(deck.commanders[0]);
    });

    test("claims no colours of its own until the deck overrules them", () => {
        expect(advisorDeck([slot("Commander", "aaa")]).identity).toBeNull();
        expect(advisorDeck([slot("Commander", "aaa")], {}).identity).toBeNull();
        expect(advisorDeck([slot("Commander", "aaa")], { allowedColorIdentity: null }).identity).toBeNull();
    });

    test("splits an overruled identity into its letters", () => {
        const deck = advisorDeck([slot("Commander", "aaa")], { allowedColorIdentity: "gu" });
        expect(deck.identity).toEqual(["U", "G"]);
    });

    test("counts copies the catalog cannot identify instead of dropping them silently", () => {
        const deck = advisorDeck([slot("Main", null, 2), slot("Main", "aaa")]);
        expect(deck.unknown).toBe(2);
        expect(deck.entries).toEqual([{ oracle_id: "aaa", qty: 1 }]);
    });

    test("says nothing about the size until the deck names one", () => {
        expect(advisorDeck([slot("Commander", "aaa")]).deckSize).toBeNull();
        expect(advisorDeck([slot("Commander", "aaa")], {}).deckSize).toBeNull();
        expect(advisorDeck([slot("Commander", "aaa")], { targetSize: null }).deckSize).toBeNull();
    });

    test("takes the command zone out of the size the graph is told", () => {
        // 100 cards with one commander is the graph's own default of 99: a deck
        // by the book must keep asking the question it always asked.
        const book = advisorDeck([slot("Commander", "aaa"), slot("Main", "bbb")], { targetSize: 100 });
        expect(book.deckSize).toBe(99);
        // Two partners fill two slots fewer.
        const partners = advisorDeck([slot("Commander", "aaa"), slot("Commander", "bbb")], { targetSize: 100 });
        expect(partners.deckSize).toBe(98);
        // An agreed size is the number the subtraction starts from.
        const agreed = advisorDeck([slot("Commander", "aaa")], { targetSize: 60 });
        expect(agreed.deckSize).toBe(59);
    });

    test("counts a commander the catalog cannot place toward the command zone", () => {
        const deck = advisorDeck([slot("Commander", null), slot("Main", "aaa")], { targetSize: 100 });
        expect(deck.deckSize).toBe(99);
    });

    test("never asks for fewer than one card", () => {
        const deck = advisorDeck([slot("Commander", "aaa"), slot("Commander", "bbb")], { targetSize: 2 });
        expect(deck.deckSize).toBe(1);
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

    test("changes when a second commander joins the command zone", () => {
        const one = advisorDeck([slot("Commander", "aaa"), slot("Main", "ccc")]);
        const two = advisorDeck([slot("Commander", "aaa"), slot("Commander", "bbb"), slot("Main", "ccc")]);
        expect(advisorSignature(two, 0.5)).not.toBe(advisorSignature(one, 0.5));
    });

    test("changes with the deck's claimed colours", () => {
        const cards = [slot("Commander", "aaa"), slot("Main", "ccc")];
        const derived = advisorSignature(advisorDeck(cards), 0.5);
        const claimed = advisorSignature(advisorDeck(cards, { allowedColorIdentity: "WU" }), 0.5);
        const other = advisorSignature(advisorDeck(cards, { allowedColorIdentity: "WUB" }), 0.5);
        expect(claimed).not.toBe(derived);
        expect(other).not.toBe(claimed);
    });

    test("changes with the size the deck is built to", () => {
        const cards = [slot("Commander", "aaa"), slot("Main", "ccc")];
        const book = advisorSignature(advisorDeck(cards, { targetSize: 100 }), 0.5);
        const smaller = advisorSignature(advisorDeck(cards, { targetSize: 60 }), 0.5);
        expect(smaller).not.toBe(book);
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

/**
 * Builds the smallest suggestion {@link filterReport} can read
 *
 * @param oracleId the card's oracle identity
 *
 * @returns the suggestion
 */
function suggestion(oracleId: string): Suggestion {
    return { oracle_id: oracleId, name: oracleId, cmc: 0, type_line: "", price_usd: null, score: 0, provenance: [] };
}

/**
 * Builds the smallest report {@link filterReport} can read
 *
 * @param suggestions the flat ranking
 * @param groups the report's groups, when the case needs them
 *
 * @returns the report
 */
function report(suggestions: Array<Suggestion>, groups?: Array<SuggestionGroup>): SuggestionReport {
    return {
        commander: null,
        commander_inferred: false,
        identity: [],
        considered: suggestions.length,
        suggestions,
        groups,
    };
}

describe("filterReport", () => {
    test("drops accepted cards from the flat ranking", () => {
        const [aaa, bbb] = [suggestion("aaa"), suggestion("bbb")];
        const filtered = filterReport(report([aaa, bbb]), ["aaa"]);
        expect(filtered.suggestions).toEqual([bbb]);
    });

    test("drops accepted cards from every group, and drops a group left empty", () => {
        const [aaa, bbb, ccc] = [suggestion("aaa"), suggestion("bbb"), suggestion("ccc")];
        const groups: Array<SuggestionGroup> = [
            { key: "one", label: "One", reason: "", suggestions: [aaa, bbb] },
            { key: "two", label: "Two", reason: "", suggestions: [ccc] },
        ];
        const filtered = filterReport(report([aaa, bbb, ccc], groups), ["ccc"]);
        expect(filtered.groups).toEqual([{ key: "one", label: "One", reason: "", suggestions: [aaa, bbb] }]);
    });

    test("leaves the report untouched when nothing is accepted", () => {
        const original = report([suggestion("aaa")]);
        expect(filterReport(original, [])).toBe(original);
    });
});

/**
 * Builds the smallest swap pairing {@link filterSwaps} can read
 *
 * @param cutOracleId the oracle identity of the card being given up
 *
 * @returns the pairing
 */
function pairing(cutOracleId: string): Swap {
    const cut: CutCandidate = { oracle_id: cutOracleId, name: cutOracleId };
    return { add_oracle_id: "add", add_name: "add", cut };
}

describe("filterSwaps", () => {
    test("drops a pairing whose cut was kept this session", () => {
        const cards = [slot("Main", "aaa"), slot("Main", "bbb")];
        const filtered = filterSwaps([pairing("aaa"), pairing("bbb")], ["aaa"], cards);
        expect(filtered.map((p) => p.cut.oracle_id)).toEqual(["bbb"]);
    });

    test("drops a pairing whose cut no longer holds a Main-zone slot, even with nothing accepted", () => {
        const cards = [slot("Main", "bbb")]; // "aaa" was already cut
        const filtered = filterSwaps([pairing("aaa"), pairing("bbb")], [], cards);
        expect(filtered.map((p) => p.cut.oracle_id)).toEqual(["bbb"]);
    });

    test("ignores a copy sitting outside the Main zone", () => {
        const cards = [slot("Side", "aaa")];
        expect(filterSwaps([pairing("aaa")], [], cards)).toEqual([]);
    });
});

describe("suggestionAddQuantity", () => {
    test("files a nonbasic as a single copy at any colour count", () => {
        expect(suggestionAddQuantity("Legendary Creature — Human Wizard", 3)).toBe(1);
        expect(suggestionAddQuantity("Land", 1)).toBe(1);
    });

    test("scales a basic against the colours the deck splits across", () => {
        expect(suggestionAddQuantity("Basic Land — Mountain", 1)).toBe(5);
        expect(suggestionAddQuantity("Basic Land — Island", 3)).toBe(3);
        expect(suggestionAddQuantity("Basic Land — Plains", 4)).toBe(2);
    });

    test("floors a five-colour deck at a single copy", () => {
        expect(suggestionAddQuantity("Basic Land — Forest", 5)).toBe(1);
    });

    test("hands a colourless deck its six Wastes", () => {
        expect(suggestionAddQuantity("Basic Land", 0)).toBe(6);
    });

    test("reads a snow basic as the basic it is", () => {
        expect(suggestionAddQuantity("Basic Snow Land — Swamp", 2)).toBe(4);
    });
});
