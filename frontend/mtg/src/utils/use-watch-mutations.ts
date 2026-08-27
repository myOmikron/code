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
 *
 * Which is also why the overlay is not dropped when the write comes back. A
 * row whose overlay goes before the loader's answer has reached the screen
 * shows the old value for a frame or two, so a single tap read as
 * foil → any → foil → any. The overlay is dropped by [`WatchMutations.settle`]
 * instead, which the page calls once it is holding fresh rows.
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
    /**
     * Drops the overlay of every row whose written change is on screen
     *
     * Called by the page when the loader hands it new rows: only then is what
     * the overlay was standing in for actually there to be shown.
     */
    settle: () => void;
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
    // Rows whose write has come back and whose re-read has been asked for. They
    // keep their overlay until the page says the new rows are on screen.
    const written = useRef<Map<UUID, number>>(new Map());
    const reread = useRef(onWritten);
    reread.current = onWritten;

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
                try {
                    await Api.watchLists.entry.update(watchList, uuid, next);
                } catch (error) {
                    // Reported already, by `handleError`. What is left to do
                    // here is take the overlay off, so the row goes back to
                    // saying what it is rather than standing on a change that
                    // never happened.
                    if (latest.current[uuid] === mine) {
                        const { [uuid]: _failed, ...rest } = held.current;
                        held.current = rest;
                        setPending(rest);
                    }
                    throw error;
                }
                // A newer tap is already on its way and will re-read the loader
                // itself; dropping the overlay here would let the row flick back
                // to what the loader still holds.
                if (latest.current[uuid] !== mine) return;

                written.current.set(uuid, mine);
                await reread.current();
            })();
        },
        [watchList],
    );

    const settle = useCallback(() => {
        if (written.current.size === 0) return;
        const rest = { ...held.current };
        const waiting = new Map<UUID, number>();
        for (const [uuid, sent] of written.current) {
            // A tap that landed after this write is its own overlay, waiting on
            // its own re-read: dropping it here would show the value it
            // replaced for as long as that read takes.
            if (latest.current[uuid] !== sent) {
                waiting.set(uuid, sent);
                continue;
            }
            delete rest[uuid];
        }
        written.current = waiting;
        held.current = rest;
        setPending(rest);
    }, []);

    return { pending, change, settle };
}
