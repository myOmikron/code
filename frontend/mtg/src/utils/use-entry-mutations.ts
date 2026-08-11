/**
 * Editing stacks without waiting for the server.
 *
 * Clicking a count up and down, or flipping a card to foil, has to land
 * immediately — a round trip plus a loader re-run before the number moves makes
 * the page feel broken. So edits are held locally, shown in place of what the
 * loader knows, and written once the clicking stops.
 *
 * This generalises what the collection page used to do for the quantity alone.
 * The rule that made that work is the one every field now follows: a change
 * counts as pending until it has been sent, and as written afterwards, because
 * the loader still holds the old value until it runs again — dropping the local
 * copy the moment the request finishes makes the row snap back.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Api } from "src/api/api";
import type { UUID } from "src/api/api";
import type { CollectionEntryResponse, UpdateCollectionEntryRequest } from "src/api/generated";

/** How long editing has to pause before the changes are written */
export const FLUSH_DELAY_MS = 600;

/** The fields of a stack this can change */
export type EntryEdit = Pick<
    UpdateCollectionEntryRequest,
    "quantity" | "condition" | "finish" | "purchase_price_cents" | "acquired_at" | "printing"
>;

/** What {@link useEntryMutations} hands back */
export type EntryMutations = {
    /**
     * The stack as it should be shown: the loader's row with everything edited
     * since laid over it.
     *
     * Generic over the row, so it also works on the listing's richer entry —
     * the edited fields are the same either way, and the card the listing
     * carries alongside them passes through untouched.
     */
    resolve: <Entry extends CollectionEntryResponse>(entry: Entry) => Entry;
    /** Records an edit, to be written once the editing settles */
    edit: (uuid: UUID, edit: EntryEdit) => void;
    /** Writes everything outstanding right now, e.g. before navigating away */
    flush: () => Promise<void>;
    /** Forgets the local copies, for when the loader has re-run and is the truth again */
    reset: () => void;
    /** Whether anything is waiting to be written */
    dirty: boolean;
};

/**
 * Local, optimistic edits to a collection's stacks.
 *
 * @param collectionUuid the collection being edited
 *
 * @returns the resolver and the mutators
 */
export function useEntryMutations(collectionUuid: UUID): EntryMutations {
    // Edited but not sent yet.
    const [pending, setPending] = useState<Record<UUID, EntryEdit>>({});
    // Sent, but the loader has not read them back — without this a row would
    // fall back to its old value the moment the write finished.
    const [written, setWritten] = useState<Record<UUID, EntryEdit>>({});

    // The flush reads these from a timer rather than from the render that
    // scheduled it, so they have to be reachable without being dependencies.
    const pendingRef = useRef(pending);
    pendingRef.current = pending;

    const send = useCallback(
        async (snapshot: Record<UUID, EntryEdit>) => {
            const edits = Object.entries(snapshot);
            if (edits.length === 0) return;

            await Promise.all(edits.map(([uuid, edit]) => Api.collections.entries.update(collectionUuid, uuid, edit)));

            setWritten((current) => {
                const next = { ...current };
                for (const [uuid, edit] of edits) next[uuid] = { ...next[uuid], ...edit };
                return next;
            });
            // Only drop what was actually sent — an edit made during the flush
            // must not be swallowed by the reset.
            setPending((current) => {
                const rest = { ...current };
                for (const [uuid, edit] of edits) {
                    if (rest[uuid] === edit) delete rest[uuid];
                }
                return rest;
            });
        },
        [collectionUuid],
    );

    useEffect(() => {
        if (Object.keys(pending).length === 0) return;
        const snapshot = pending;
        const timer = setTimeout(() => void send(snapshot), FLUSH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [pending, send]);

    const resolve = useCallback(
        <Entry extends CollectionEntryResponse>(entry: Entry): Entry => {
            const edit = { ...written[entry.uuid], ...pending[entry.uuid] };
            // Spreading the edit straight onto the row would drop `undefined`
            // over a real value: an edit that only touched the finish carries
            // `quantity: undefined`, and that must not erase the count.
            const merged = { ...entry };
            for (const [key, value] of Object.entries(edit)) {
                if (value !== undefined) Object.assign(merged, { [key]: value });
            }
            return merged;
        },
        [pending, written],
    );

    const edit = useCallback((uuid: UUID, change: EntryEdit) => {
        setPending((current) => ({ ...current, [uuid]: { ...current[uuid], ...change } }));
    }, []);

    const flush = useCallback(async () => {
        await send(pendingRef.current);
    }, [send]);

    const reset = useCallback(() => setWritten({}), []);

    return { resolve, edit, flush, reset, dirty: Object.keys(pending).length > 0 };
}
