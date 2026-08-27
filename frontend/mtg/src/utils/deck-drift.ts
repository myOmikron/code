/**
 * Reading the answer to "is the deck in the box the deck on the list".
 *
 * The service works the disagreements out and hands over four lists; this turns
 * them into the shape both places that show them want — the header, which only
 * asks how many cards are affected, and the sourcing view, which reads out why.
 * Pure, so the counting can be tested without a browser.
 */

import type { DeckDriftResponse, DeckDriftRowResponse } from "src/api/generated";

/** Why a card is in the drift list */
export type DriftKind = "pending" | "other-printing" | "not-in-deck" | "surplus";

/** The four kinds in the order the sourcing view reads them out */
export const DRIFT_KINDS: Array<DriftKind> = ["pending", "other-printing", "not-in-deck", "surplus"];

/** One reason, with the cards it applies to */
export type DriftSection = {
    /** What the cards below have in common */
    kind: DriftKind;
    /** The cards, as the service listed them */
    rows: Array<DeckDriftRowResponse>;
    /** How many copies they come to */
    copies: number;
};

/**
 * The non-empty reasons, in a fixed order
 *
 * Fixed rather than by size: the list is read as a sentence about the deck, and
 * a section that jumps around as cards are sorted is one nobody learns to read.
 *
 * @param drift what the service answered
 *
 * @returns one section per reason that applies to at least one card
 */
export function driftSections(drift: DeckDriftResponse): Array<DriftSection> {
    if (!drift.keeps_collection) return [];
    return DRIFT_KINDS.flatMap((kind) => {
        const rows = rowsOf(drift, kind);
        if (rows.length === 0) return [];
        return [{ kind, rows, copies: rows.reduce((sum, row) => sum + row.quantity, 0) }];
    });
}

/**
 * How many copies the list and the collection disagree about altogether
 *
 * @param drift what the service answered
 *
 * @returns the number the header chip carries, 0 when the two agree
 */
export function driftCopies(drift: DeckDriftResponse): number {
    return driftSections(drift).reduce((sum, section) => sum + section.copies, 0);
}

/**
 * The rows behind one reason
 *
 * @param drift what the service answered
 * @param kind the reason
 *
 * @returns the cards it applies to
 */
function rowsOf(drift: DeckDriftResponse, kind: DriftKind): Array<DeckDriftRowResponse> {
    switch (kind) {
        case "pending":
            return drift.pending;
        case "other-printing":
            return drift.other_printing;
        case "not-in-deck":
            return drift.not_in_deck;
        case "surplus":
            return drift.surplus;
    }
}
