import { useCallback, useRef } from "react";

/** Puts a write at the end of the queue and answers once it has run, see {@link useWriteQueue} */
export type WriteQueue = (work: () => Promise<unknown>) => Promise<void>;

/**
 * Writes that go out one after another
 *
 * Out of order, a quick series of writes leaves the deck holding whichever one
 * the server happened to finish last. A write that fails rejects its own promise
 * and does not hold up the ones queued after it.
 *
 * @returns the queue
 */
export function useWriteQueue(): WriteQueue {
    const queue = useRef<Promise<void>>(Promise.resolve());
    return useCallback((work) => {
        const next = queue.current.then(async () => {
            await work();
        });
        queue.current = next.catch(() => undefined);
        return next;
    }, []);
}
