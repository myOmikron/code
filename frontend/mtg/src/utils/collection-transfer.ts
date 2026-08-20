/**
 * Filing stacks of cards into a collection, merging with what is already there.
 *
 * The backend's bulk insert deliberately never merges — the same pile written down twice is two
 * rows. Both the csv import and the scanner's transfer want the opposite, so the fold lives here
 * once: a stack that already exists as a row (same printing, condition and finish) tops up that
 * row's quantity instead of being filed again.
 */

import { Api } from "src/api/api";
import type { UUID } from "src/api/api";
import type { CollectionEntryResponse, NewCollectionEntry } from "src/api/generated";

/**
 * How many stacks go into one request.
 *
 * The server writes a request as one bulk insert, so this is about keeping the
 * body a sensible size rather than about the database — a whole binder at once
 * would be megabytes.
 */
const CHUNK_SIZE = 1000;

/** What filing a batch of stacks ended up doing */
export type TransferResult = {
    /** Stacks newly filed */
    created: number;
    /** Stacks that already existed and were topped up */
    merged: number;
};

/**
 * Splits stacks into the ones to file fresh and the rows to top up.
 *
 * Pure, so the fold is testable without a backend. The stacks are expected to already be unique
 * per (printing, condition, finish) — {@link foldStacks} gets them there.
 *
 * @param stacks what is being filed, one per distinct (printing, condition, finish)
 * @param existing every row the collection already holds
 *
 * @returns what to insert and which rows to raise to which quantity
 */
export function planTransfer(
    stacks: NewCollectionEntry[],
    existing: CollectionEntryResponse[],
): { fresh: NewCollectionEntry[]; topUps: Array<{ uuid: string; quantity: number }> } {
    const fresh: NewCollectionEntry[] = [];
    const topUps: Array<{ uuid: string; quantity: number }> = [];
    for (const stack of stacks) {
        const already = existing.find(
            (entry) =>
                entry.printing === stack.printing &&
                entry.condition === stack.condition &&
                entry.finish === stack.finish,
        );
        if (already === undefined) fresh.push(stack);
        else topUps.push({ uuid: already.uuid, quantity: already.quantity + stack.quantity });
    }
    return { fresh, topUps };
}

/**
 * Adds entries describing the same printing in the same condition and finish up into one stack.
 *
 * An export lists a playset as four lines as often as one, and the scanner stages every copy as
 * its own entry — either way it is one stack in one box. Of fields a stack cannot merge (price,
 * acquisition date), the first entry's win.
 *
 * @param entries the entries as the caller collected them
 *
 * @returns one stack per distinct (printing, condition, finish)
 */
export function foldStacks(entries: NewCollectionEntry[]): NewCollectionEntry[] {
    const stacks = new Map<string, NewCollectionEntry>();
    for (const entry of entries) {
        const key = `${entry.printing}|${entry.condition}|${entry.finish}`;
        const existing = stacks.get(key);
        if (existing !== undefined) existing.quantity += entry.quantity;
        else stacks.set(key, { ...entry });
    }
    return [...stacks.values()];
}

/**
 * Files stacks into a collection, topping up the rows that already exist.
 *
 * Not atomic: a failure mid-way may leave earlier chunks written, so a retry
 * can file cards twice. Callers report the error and leave the retry to the
 * user rather than retrying silently.
 *
 * @param collection the collection being filled
 * @param stacks what to file, one per distinct (printing, condition, finish)
 *
 * @returns how many stacks were created and how many merged
 */
export async function fileStacks(collection: UUID, stacks: NewCollectionEntry[]): Promise<TransferResult> {
    // What is already filed, fetched here rather than handed in: this is the
    // one place that genuinely needs every stack, and asking for them once per
    // transfer beats keeping them loaded on a page that otherwise reads sixty
    // rows at a time.
    const existing = (await Api.collections.entries.list(collection)).entries;
    const { fresh, topUps } = planTransfer(stacks, existing);

    for (let offset = 0; offset < fresh.length; offset += CHUNK_SIZE) {
        await Api.collections.entries.add(collection, fresh.slice(offset, offset + CHUNK_SIZE));
    }
    for (const topUp of topUps) {
        await Api.collections.entries.update(collection, topUp.uuid, { quantity: topUp.quantity });
    }

    return { created: fresh.length, merged: topUps.length };
}
