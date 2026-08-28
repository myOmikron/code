import { describe, expect, it } from "vitest";
import type { DeckDriftResponse, DeckDriftRowResponse } from "src/api/generated";
import { driftCopies, driftSections } from "src/utils/deck-drift";

/**
 * One row of a drift list
 *
 * @param quantity how many copies it is about
 *
 * @returns the row
 */
function row(quantity: number): DeckDriftRowResponse {
    return { printing: "print", quantity, foil: false };
}

/**
 * An answer with the given lists, everything else empty
 *
 * @param drift the lists that are not empty
 *
 * @returns the answer as the service would send it
 */
function answer(drift: Partial<DeckDriftResponse>): DeckDriftResponse {
    return {
        keeps_collection: true,
        pending: [],
        other_printing: [],
        not_in_deck: [],
        surplus: [],
        ...drift,
    };
}

describe("driftSections", () => {
    it("says nothing about a deck that keeps no collection", () => {
        expect(driftSections(answer({ keeps_collection: false, pending: [row(3)] }))).toEqual([]);
        expect(driftCopies(answer({ keeps_collection: false, pending: [row(3)] }))).toBe(0);
    });

    it("says nothing about a deck that holds what it lists", () => {
        expect(driftSections(answer({}))).toEqual([]);
        expect(driftCopies(answer({}))).toBe(0);
    });

    it("keeps the reasons in their reading order and drops the empty ones", () => {
        const sections = driftSections(answer({ surplus: [row(1)], pending: [row(2)] }));

        expect(sections.map((section) => section.kind)).toEqual(["pending", "surplus"]);
    });

    it("adds the copies up per reason and across them", () => {
        const drift = answer({ pending: [row(2), row(1)], not_in_deck: [row(4)] });
        const sections = driftSections(drift);

        expect(sections.map((section) => section.copies)).toEqual([3, 4]);
        expect(driftCopies(drift)).toBe(7);
    });
});
