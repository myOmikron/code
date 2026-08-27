/**
 * Changing what a watched row counts, without waiting for the server.
 *
 * Flipping a badge is a glance-and-tap gesture, and a round trip plus a loader
 * re-run before the label moves makes it feel broken — locally that is already
 * over 200ms, and it is the badge, not the numbers, that the thumb is waiting
 * on. So the change is shown at once and written behind it.
 *
 * The numbers underneath are a different matter and deliberately lag: how many
 * copies are free and what the cheapest matching print costs are things only
 * the database can work out from the new switches. Guessing at them here would
 * put a figure on screen that nothing stands behind, so they keep their old
 * value for the one round trip it takes to learn the real one.
 *
 * This is the same bargain `use-entry-mutations` strikes for a collection's
 * stacks, with one difference: that one never has to re-read the loader,
 * because everything it edits is also everything it shows.
 */

import { useCallback, useRef, useState } from "react";
import type { UUID } from "src/api/api";
import { Api } from "src/api/api";
import type { WatchMatchPatch } from "src/utils/watch-list";

/** What {@link useWatchMutations} hands back */
export type WatchMutations = {
    /** What has been changed but not read back yet, by row */
    pending: Record<UUID, WatchMatchPatch>;
    /** Records a change and starts writing it */
    change: (uuid: UUID, patch: WatchMatchPatch) => void;
};

/**
 * Optimistic changes to what a watch list's rows count.
 *
 * @param watchList the list being edited
 * @param onWritten re-reads the loader once a change has landed, so the counts
 *        and prices the server works out catch up with the switches
 *
 * @returns what is outstanding, and the mutator
 */
export function useWatchMutations(watchList: UUID, onWritten: () => Promise<void>): WatchMutations {
    const [pending, setPending] = useState<Record<UUID, WatchMatchPatch>>({});

    // The sender reads these from inside a promise rather than from the render
    // that started it, so they have to be reachable without being dependencies.
    const held = useRef<Record<UUID, WatchMatchPatch>>({});
    const latest = useRef<Record<UUID, number>>({});
    const settle = useRef(onWritten);
    settle.current = onWritten;

    const change = useCallback(
        (uuid: UUID, patch: WatchMatchPatch) => {
            // Accumulated rather than sent on its own, and the whole of it goes
            // with every request: two taps in quick succession then describe the
            // same end state, so whichever of them the server answers last still
            // leaves the row saying what was asked for.
            const next = { ...held.current[uuid], ...patch };
            held.current = { ...held.current, [uuid]: next };
            setPending(held.current);

            const mine = (latest.current[uuid] ?? 0) + 1;
            latest.current[uuid] = mine;

            void (async () => {
                await Api.watchLists.entry.update(watchList, uuid, next);
                // A newer tap is already on its way and will re-read the loader
                // itself; dropping the overlay here would let the row flick back
                // to what the loader still holds.
                if (latest.current[uuid] !== mine) return;

                await settle.current();

                // Only now, with the loader carrying the change, is the local
                // copy safe to forget.
                if (latest.current[uuid] !== mine) return;
                const { [uuid]: _gone, ...rest } = held.current;
                held.current = rest;
                setPending(rest);
            })();
        },
        [watchList],
    );

    return { pending, change };
}
