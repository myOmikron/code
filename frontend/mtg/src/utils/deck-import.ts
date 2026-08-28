/**
 * Turning a pasted decklist into cards in a deck.
 *
 * Three steps that always belong together: read the lines, place them in the
 * service's own catalog, write what was found. Shared so that the import dialog
 * and the "build a deck from this list" path cannot drift apart.
 */

import { Api } from "src/api/api";
import type { AddDeckCardRequest } from "src/api/generated";
import type { DecklistRow } from "src/utils/decklist";
import { parseDecklist } from "src/utils/decklist";
import { resolveLookups } from "src/utils/printing-catalog";

/** What an import ended up doing */
export type ImportOutcome = {
    /** How many slots were written */
    added: number;
    /** How many copies those slots hold */
    copies: number;
    /** Names the catalog could not place */
    unmatched: Array<string>;
    /** How many copies were filed into the deck's own collection */
    filed: number;
};

/**
 * Write a decklist into a deck
 *
 * @param deckUuid the deck to fill
 * @param rows the cards, already read off a list
 * @param options how to write them
 * @param options.replace whether to throw away what is in the deck first
 * @param options.intoCollection whether the deck should also physically hold what was written
 * @param options.onProgress called while the catalog lookups run
 *
 * @returns what was written and what could not be placed
 */
export async function importRows(
    deckUuid: string,
    rows: Array<DecklistRow>,
    options: {
        replace?: boolean;
        intoCollection?: boolean;
        onProgress?: (done: number, total: number) => void;
    } = {},
): Promise<ImportOutcome> {
    if (rows.length === 0) return { added: 0, copies: 0, unmatched: [], filed: 0 };

    const resolved = await resolveLookups(
        rows.map((row) => ({ name: row.name, set_code: row.setCode, collector_number: row.collectorNumber })),
        options.onProgress,
    );

    const cards: Array<AddDeckCardRequest> = [];
    const unmatched: Array<string> = [];
    let copies = 0;

    rows.forEach((row, index) => {
        const printing = resolved[index];
        if (printing == null) {
            unmatched.push(row.name);
            return;
        }
        cards.push({
            printing: printing.id,
            quantity: row.quantity,
            zone: row.zone,
            ...(row.foil === true ? { foil: true } : {}),
        });
        copies += row.quantity;
    });

    if (cards.length === 0) return { added: 0, copies: 0, unmatched, filed: 0 };

    const { added } = await Api.decks.cards.import(deckUuid, {
        cards: merged(cards),
        replace: options.replace ?? false,
    });
    const filed = options.intoCollection === true ? await fileIntoCollection(deckUuid) : 0;
    return { added, copies, unmatched, filed };
}

/**
 * Say the deck physically holds what its list now asks for
 *
 * The deck gets a collection of its own if it keeps none yet — attaching is
 * idempotent — and every slot is topped up to its count in the finish it asks
 * for. Only the shortfall is filed, so a deck that was already sourced out of
 * a collection keeps the copies it has, origin and all.
 *
 * @param deckUuid the deck that was just written
 *
 * @returns how many copies were filed
 */
async function fileIntoCollection(deckUuid: string): Promise<number> {
    await Api.decks.collection.attach(deckUuid);
    const { filed } = await Api.decks.sourcing.fill(deckUuid);
    return filed;
}

/**
 * Read a pasted decklist and write it into a deck, see {@link importRows}
 *
 * @param deckUuid the deck to fill
 * @param text the pasted list
 * @param options how to write it
 * @param options.replace whether to throw away what is in the deck first
 * @param options.intoCollection whether the deck should also physically hold what was written
 * @param options.onProgress called while the catalog lookups run
 *
 * @returns what was written and what could not be placed
 */
export async function importDecklist(
    deckUuid: string,
    text: string,
    options: {
        replace?: boolean;
        intoCollection?: boolean;
        onProgress?: (done: number, total: number) => void;
    } = {},
): Promise<ImportOutcome> {
    return importRows(deckUuid, parseDecklist(text).rows, options);
}

/**
 * Fold repeats of the same printing in the same zone into one slot
 *
 * A list that names a card on two lines means two copies, not two rows, and a
 * builder that exports one card several times should not turn into a deck that
 * shows it several times.
 *
 * @param cards what the list asked for
 *
 * @returns one entry per printing and zone
 */
function merged(cards: Array<AddDeckCardRequest>): Array<AddDeckCardRequest> {
    const bySlot = new Map<string, AddDeckCardRequest>();
    for (const card of cards) {
        const key = `${card.zone}|${card.printing}|${card.foil === true ? "foil" : "nonfoil"}`;
        const existing = bySlot.get(key);
        if (existing === undefined) bySlot.set(key, { ...card });
        else existing.quantity += card.quantity;
    }
    return [...bySlot.values()];
}
