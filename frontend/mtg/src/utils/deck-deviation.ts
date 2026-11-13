/**
 * Reading the Deviation: "is the deck in the box the deck on the list".
 *
 * The service hands each Deck entry out the copies of the Physical deck that
 * answer it; this turns that into what a line of the card list says about
 * itself and the one number the header carries. Pure, so the counting can be
 * tested without a browser.
 */

import type { DeckDeviationResponse, DeviationCopiesResponse, LineDeviationResponse } from "src/api/generated";

/** One statement a line of the card list makes about the Physical deck */
export type LineMark =
    /** Copies are missing: `held` of the `wanted` copies are in the deck */
    | { kind: "short"; held: number; wanted: number }
    /** Copies of another printing or finish stand in for the listed one */
    | { kind: "other-printing"; copies: number }
    /** More copies are in the deck than the line asks for */
    | { kind: "surplus"; copies: number }
    /** Copies of the line in the deck are Proxies */
    | { kind: "proxies"; copies: number };

/**
 * What one line says about the Physical deck, in reading order
 *
 * A line the deck holds exactly says nothing, unless some of its copies are
 * Proxies: that is no Deviation, but it is worth seeing on the line.
 *
 * @param line what the Physical deck holds for the Deck entry, `undefined` for
 *   a line the Deviation does not cover (the maybe board, or no Physical deck)
 *
 * @returns the marks, empty when there is nothing to say
 */
export function lineMarks(line: LineDeviationResponse | undefined): Array<LineMark> {
    if (line === undefined) return [];
    const other = copiesOf(line.other_printing);
    const marks: Array<LineMark> = [];
    if (line.missing > 0) {
        const held = line.in_deck + other;
        marks.push({ kind: "short", held, wanted: held + line.missing });
    }
    if (other > 0) marks.push({ kind: "other-printing", copies: other });
    if (line.surplus > 0) marks.push({ kind: "surplus", copies: line.surplus });
    if (line.proxies > 0) marks.push({ kind: "proxies", copies: line.proxies });
    return marks;
}

/**
 * How many copies the list and the Physical deck disagree about altogether
 *
 * Proxies are no Deviation: a Proxy of the line's printing fulfils it.
 *
 * @param deviation what the service answered
 *
 * @returns the number the header carries, 0 when the two agree
 */
export function deviationCount(deviation: DeckDeviationResponse): number {
    if (!deviation.has_physical_deck) return 0;
    const lines = deviation.entries.reduce(
        (sum, line) => sum + line.missing + copiesOf(line.other_printing) + line.surplus,
        0,
    );
    return lines + copiesOf(deviation.not_on_list);
}

/**
 * The Deviation's lines by their Deck entry
 *
 * @param deviation what the service answered, `null` where the account may not see it
 *
 * @returns the lines, empty without a Physical deck
 */
export function linesByEntry(deviation: DeckDeviationResponse | null): Map<string, LineDeviationResponse> {
    if (deviation === null || !deviation.has_physical_deck) return new Map();
    return new Map(deviation.entries.map((line) => [line.entry, line]));
}

/**
 * How many copies a list of copies comes to
 *
 * @param copies the copies
 *
 * @returns their sum
 */
function copiesOf(copies: Array<DeviationCopiesResponse>): number {
    return copies.reduce((sum, entry) => sum + entry.quantity, 0);
}
