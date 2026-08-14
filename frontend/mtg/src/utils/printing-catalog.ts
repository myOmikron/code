/**
 * Placing what an export file names in the service's own card catalog.
 *
 * This used to be Scryfall's job, asked from the browser: batches of
 * seventy-five identifiers, a hundred milliseconds apart because their rate
 * limit says so, which is minutes of waiting for a collection of five figures.
 * The service holds a copy of that catalog — it is what the card list and the
 * statistics are already answered from — so the same question is a handful of
 * requests to our own backend, with no rate limit and nothing to be throttled
 * by.
 *
 * Resolving here also means an import can only ever file printings the rest of
 * the app can read back. A card Scryfall knew and the catalog did not used to
 * end up filed as a row nothing could show.
 */

import { Api } from "src/api/api";
import type { PrintingLookupRequest, ResolvedPrintingResponse } from "src/api/generated";

/**
 * How many cards go into one request.
 *
 * The endpoint takes twice this, so the size is chosen for the progress bar
 * rather than for the limit: a five-figure import moves in visible steps
 * instead of sitting still through one long request.
 */
const BATCH_SIZE = 1000;

/** What a Scryfall id looks like, since the endpoint takes nothing else */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identifies a lookup, so identical rows are asked about once
 *
 * @param lookup the lookup
 *
 * @returns a key equal for equal lookups
 */
function keyOf(lookup: PrintingLookupRequest): string {
    return [lookup.id, lookup.set_code, lookup.collector_number, lookup.name, lookup.lang]
        .map((part) => (part ?? "").trim().toLowerCase())
        .join("|");
}

/**
 * Drops what the endpoint would reject.
 *
 * A csv column called "scryfall id" holds whatever the tracker that wrote it
 * felt like. Sending that as an id would fail the whole request, where leaving
 * it out only means the row is placed by its set and number like every other.
 *
 * @param lookup the lookup as the caller built it
 *
 * @returns the lookup, with an unusable id removed
 */
function sanitised(lookup: PrintingLookupRequest): PrintingLookupRequest {
    if (lookup.id !== undefined && lookup.id !== null && !UUID.test(lookup.id)) {
        return { ...lookup, id: undefined };
    }
    return lookup;
}

/**
 * Resolves a list of lookups to printings, in order.
 *
 * Identical lookups are asked about once, so a playset written as four lines
 * costs one. Every lookup gets an answer at its own index — `null` for the ones
 * the catalog cannot place, which the caller has to report rather than quietly
 * drop.
 *
 * @param lookups the cards to place, as the export named them
 * @param onProgress called with how many lookups have been answered
 *
 * @returns one printing or `null` per input, index-aligned
 */
export async function resolveLookups(
    lookups: PrintingLookupRequest[],
    onProgress?: (done: number, total: number) => void,
): Promise<Array<ResolvedPrintingResponse | null>> {
    const unique = new Map<string, PrintingLookupRequest>();
    for (const lookup of lookups.map(sanitised)) unique.set(keyOf(lookup), lookup);

    const pending = [...unique.entries()];
    const found = new Map<string, ResolvedPrintingResponse>();

    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
        const batch = pending.slice(offset, offset + BATCH_SIZE);
        const { printings } = await Api.printings.resolve(batch.map(([, lookup]) => lookup));

        // Each answer names the lookup it belongs to, since the ones the
        // catalog could not place are simply absent.
        for (const printing of printings) {
            const asked = batch[printing.lookup];
            if (asked !== undefined) found.set(asked[0], printing);
        }

        onProgress?.(Math.min(offset + BATCH_SIZE, pending.length), pending.length);
    }

    return lookups.map((lookup) => found.get(keyOf(sanitised(lookup))) ?? null);
}
