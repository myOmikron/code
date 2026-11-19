import { describe, expect, it } from "vitest";
import type { DeckDeviationResponse, DeviationCopiesResponse, LineDeviationResponse } from "src/api/generated";
import { deviationCount, isAllProxies, lineMarks } from "src/utils/deck-deviation";

/**
 * Copies lying in the Physical deck
 *
 * @param quantity how many
 * @param proxy whether they are Proxies
 *
 * @returns the copies
 */
function copies(quantity: number, proxy = false): DeviationCopiesResponse {
    return { printing: "print", quantity, finish: "Nonfoil", proxy };
}

/**
 * What the Physical deck holds for one Deck entry, nothing deviating unless said
 *
 * @param line the fields that differ
 *
 * @returns the line
 */
function line(line: Partial<LineDeviationResponse>): LineDeviationResponse {
    return { entry: "entry", in_deck: 0, proxies: 0, other_printing: [], missing: 0, surplus: 0, ...line };
}

/**
 * A Deviation answer for a deck with a Physical deck
 *
 * @param answer the fields that differ
 *
 * @returns the answer
 */
function answer(answer: Partial<DeckDeviationResponse>): DeckDeviationResponse {
    return { has_physical_deck: true, entries: [], not_on_list: [], ...answer };
}

describe("lineMarks", () => {
    it("says nothing about a line the deck holds exactly", () => {
        expect(lineMarks(line({ in_deck: 2 }))).toEqual([]);
    });

    it("says how many of the line's copies are in the deck when some are missing", () => {
        expect(lineMarks(line({ in_deck: 1, missing: 2 }))).toEqual([{ kind: "short", held: 1, wanted: 3 }]);
    });

    it("counts another printing standing in as held, and names it", () => {
        const marks = lineMarks(line({ in_deck: 1, other_printing: [copies(1), copies(1, true)], missing: 1 }));

        expect(marks).toEqual([
            { kind: "short", held: 3, wanted: 4 },
            { kind: "other-printing", copies: 2 },
        ]);
    });

    it("says when a line has more copies than it asks for", () => {
        expect(lineMarks(line({ in_deck: 1, surplus: 2 }))).toEqual([{ kind: "surplus", copies: 2 }]);
    });

    it("says how many copies are Proxies, also on a line that holds what it lists", () => {
        expect(lineMarks(line({ in_deck: 2, proxies: 1 }))).toEqual([{ kind: "proxies", copies: 1 }]);
    });

    it("says nothing about a line nobody asked about", () => {
        expect(lineMarks(undefined)).toEqual([]);
    });
});

describe("deviationCount", () => {
    it("is zero for a deck without a Physical deck", () => {
        const none = answer({ has_physical_deck: false, entries: [line({ missing: 3 })] });

        expect(deviationCount(none)).toBe(0);
    });

    it("adds up missing, other printing, surplus and not-on-the-list copies, but not Proxies", () => {
        const deviation = answer({
            entries: [line({ missing: 2, proxies: 1, in_deck: 1 }), line({ other_printing: [copies(1)], surplus: 1 })],
            not_on_list: [copies(3)],
        });

        expect(deviationCount(deviation)).toBe(7);
    });
});

describe("isAllProxies", () => {
    it("greys a line whose every copy is a Proxy", () => {
        expect(isAllProxies(line({ in_deck: 2, proxies: 2 }))).toBe(true);
    });

    it("counts Proxies of another printing standing in as Proxies too", () => {
        expect(isAllProxies(line({ in_deck: 1, proxies: 1, other_printing: [copies(1, true)] }))).toBe(true);
    });

    it("keeps a line with one real copy beside a Proxy in colour", () => {
        expect(isAllProxies(line({ in_deck: 2, proxies: 1 }))).toBe(false);
        expect(isAllProxies(line({ in_deck: 1, proxies: 1, other_printing: [copies(1)] }))).toBe(false);
    });

    it("keeps a line still missing copies in colour", () => {
        expect(isAllProxies(line({ in_deck: 1, proxies: 1, missing: 1 }))).toBe(false);
    });

    it("keeps a line without any Proxy in colour", () => {
        expect(isAllProxies(line({ in_deck: 2 }))).toBe(false);
        expect(isAllProxies(line({ missing: 2 }))).toBe(false);
    });

    it("keeps a line nobody asked about in colour", () => {
        expect(isAllProxies(undefined)).toBe(false);
    });
});
