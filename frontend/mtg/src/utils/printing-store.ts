/**
 * Keeping resolved printings on disk, so a reload does not start from nothing.
 *
 * The card images are not the problem — Scryfall serves them with a year of
 * `max-age`, so the browser has them long before the app asks. What the app
 * does *not* have after a reload is the image *urls*: those come out of
 * `/cards/collection`, and until that round trip finishes there is no `<img>`
 * to load anything into. That gap is what this closes.
 *
 * A printing is immutable — name, set, artwork and collector number are decided
 * when it is printed and never change. Only the price moves, which is why
 * records carry the day they were fetched.
 */

import { DEFAULT_FINISHES } from "src/utils/scryfall";
import type { Printing } from "src/utils/scryfall";

/** Database holding the card data the collection views need */
const DATABASE_NAME = "planarium-printings";

/** The only store in it, keyed by printing id */
const STORE_NAME = "printings";

/**
 * How long a stored price is treated as current.
 *
 * Only the price ages; everything else about a printing is permanent. An
 * expired record is therefore still used to draw the page and refreshed behind
 * it, because a day-old price is not worth a blank screen.
 */
export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * How many printings are read per transaction.
 *
 * Every `get` fires its own completion callback, and eleven thousand of them
 * queued back to back is one long task that the browser cannot interrupt — the
 * tab simply stops for a second or more. Splitting the read lets it paint in
 * between, which is the difference between a progress bar and a freeze.
 */
const READ_CHUNK = 500;

/** What is written per printing */
type StoredPrinting = {
    /** The card data */
    printing: Printing;
    /** When it was last read from Scryfall, as a unix timestamp in milliseconds */
    fetchedAt: number;
};

/** A record read back out, together with whether its price has aged out */
export type CachedPrinting = StoredPrinting & {
    /** Whether the price is old enough to be worth fetching again */
    stale: boolean;
};

/**
 * Opens the database, creating the store on first use
 *
 * @returns the open database
 */
function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Reads whatever of the wanted printings is on disk.
 *
 * Done in chunks with a yield between them, so a collection of thousands does
 * not lock the page up while it loads. Failures resolve to an empty result
 * rather than rejecting: this is a cache, and a browser in private mode or out
 * of quota must cost the app nothing more than a slower page.
 *
 * @param ids the printing ids to look for
 * @param onProgress called with how many ids have been looked at
 *
 * @returns the records found, keyed by id
 */
export async function readPrintings(
    ids: string[],
    onProgress?: (done: number, total: number) => void,
): Promise<Map<string, CachedPrinting>> {
    const found = new Map<string, CachedPrinting>();
    if (ids.length === 0) return found;

    try {
        const database = await openDatabase();

        for (let offset = 0; offset < ids.length; offset += READ_CHUNK) {
            const chunk = ids.slice(offset, offset + READ_CHUNK);

            await new Promise<void>((resolve, reject) => {
                const transaction = database.transaction(STORE_NAME, "readonly");
                const store = transaction.objectStore(STORE_NAME);
                const now = Date.now();

                for (const id of chunk) {
                    const request = store.get(id);
                    request.onsuccess = () => {
                        const stored = request.result as StoredPrinting | undefined;
                        if (stored !== undefined) {
                            found.set(id, {
                                ...stored,
                                // Records written before a field existed do not
                                // grow it by being read back. Filling it here
                                // keeps every consumer from having to know which
                                // version of the shape it is holding.
                                printing: {
                                    ...stored.printing,
                                    finishes: stored.printing.finishes ?? DEFAULT_FINISHES,
                                },
                                stale: now - stored.fetchedAt > PRICE_MAX_AGE_MS,
                            });
                        }
                    };
                }

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });

            onProgress?.(Math.min(offset + READ_CHUNK, ids.length), ids.length);
            // A macrotask, not a microtask: only this hands the thread back far
            // enough for the browser to actually paint between chunks.
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        database.close();
    } catch (error) {
        console.error("Could not read the printing cache", error);
        return new Map();
    }

    return found;
}

/**
 * Writes printings to disk, stamped with now.
 *
 * @param printings the cards to store
 */
export async function writePrintings(printings: Printing[]): Promise<void> {
    if (printings.length === 0) return;

    try {
        const database = await openDatabase();
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const fetchedAt = Date.now();

            for (const printing of printings) store.put({ printing, fetchedAt }, printing.id);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
    } catch (error) {
        // Out of quota, or private browsing. The app works without the cache.
        console.error("Could not write the printing cache", error);
    }
}
