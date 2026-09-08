//! Turns the printing ids a staged stack carries into cards that can be drawn.
//!
//! A session stores what the scanner decided — a Scryfall id, a count, a finish — and nothing
//! about how the card looks. The scanner itself has the whole catalogue on the device and needs
//! no help, but the desk does not: the point of persisting a session is that it can be corrected
//! from a machine that has never loaded a 85 MB index, so the names and artwork come from the
//! service's own copy of the catalogue instead.
import { Api } from "src/api/api";
import { referenceImageUrl } from "src/scanner/reference-images";
import type { CardRecord } from "src/types";

/** Resolved cards, kept for the session: a printing's name does not change while a page is open. */
const known = new Map<string, CardRecord>();

/** Lookups already in flight, so a list of forty rows asks once rather than forty times. */
let waiting: Promise<void> | null = null;

/** One catalogue row, as the service answers it */
type CataloguePrinting = {
    id: string;
    name: string;
    set_code: string;
    set_name: string;
    collector_number: string;
    lang: string;
};

/**
 * Builds the record the rest of the app draws from a resolved catalogue row
 *
 * @param printing the row the service answered with
 *
 * @returns the card
 */
function toRecord(printing: CataloguePrinting): CardRecord {
    return {
        id: printing.id,
        name: printing.name,
        setName: printing.set_name,
        setCode: printing.set_code,
        collectorNumber: printing.collector_number,
        manaCost: "",
        typeLine: "",
        colors: [],
        // Derived rather than fetched: the artwork's url is the printing's id, and the catalogue
        // does not carry one.
        imageUrl: referenceImageUrl(printing.id, 0),
        priceEur: null,
        lang: printing.lang,
    };
}

/**
 * What is already known about a printing
 *
 * @param printing the Scryfall id
 *
 * @returns the card, or null when it has not been looked up yet
 */
export function knownCard(printing: string): CardRecord | null {
    return known.get(printing) ?? null;
}

/**
 * Looks up every printing not seen yet, in one request.
 *
 * @param printings the ids on screen
 *
 * @returns once the lookup is done, whether or not it found anything
 */
export async function resolveCards(printings: readonly string[]): Promise<void> {
    const wanted = [...new Set(printings)].filter((printing) => !known.has(printing));
    if (wanted.length === 0) return;
    // One request at a time. A list that grows while its lookup is running asks again afterwards
    // rather than in parallel, which is what keeps a scanner adding a card a second from opening a
    // request per card.
    const run = async () => {
        // Quiet on purpose: a name that cannot be looked up costs a row its title, and the row is
        // still correctable. Replacing the page with the error screen over it would not be.
        const answer = await Api.printings
            .resolveQuietly(wanted.map((printing) => ({ id: printing })))
            .catch(() => null);
        for (const printing of answer?.printings ?? []) known.set(printing.id, toRecord(printing));
    };
    waiting = (waiting ?? Promise.resolve()).then(run, run);
    await waiting;
}
