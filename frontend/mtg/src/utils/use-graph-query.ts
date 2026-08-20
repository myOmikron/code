import { useEffect, useState } from "react";

/** How long the deck has to hold still before the graph is asked */
export const GRAPH_DEBOUNCE_MS = 600;

/**
 * What one graph query knows right now.
 *
 * `data` survives a refetch: an edit changes the signature, but the previous
 * answer is still the best thing to show while the next one is computed —
 * replacing a suggestion list with a spinner after every accepted card is how
 * the user loses their place in it. `stale` says whether what is on screen
 * answers the current question or the last one.
 */
export type GraphQuery<T> = {
    /** Nothing asked, waiting on an answer, holding one, or refused */
    state: "idle" | "loading" | "ready" | "unavailable";
    /** The freshest answer available, including a stale one during a refetch */
    data: T | null;
    /** Whether `data` answers an older question than the current one */
    stale: boolean;
};

/**
 * Reads a cache entry and marks it most-recently-used.
 *
 * `Map.set` on an existing key does not reorder it, and eviction drops the
 * first key in insertion order — so without the delete-then-set the entry the
 * user keeps returning to is the first one thrown away.
 *
 * @param cache the query's cache
 * @param key the signature to read
 *
 * @returns the cached answer, or nothing
 */
function readCache<T>(cache: Map<string, T>, key: string): T | undefined {
    const hit = cache.get(key);
    if (hit === undefined) return undefined;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
}

/**
 * Asks the graph advisor one question, debounced, abortable and cached.
 *
 * The shared machinery behind every advisor panel: an edit that changes the
 * signature debounces, aborts whatever is in flight — the answer to a deck
 * that no longer exists is not worth having — and caches per session, keyed
 * on a signature the caller builds from exactly what the request body holds.
 *
 * @param signature everything the answer depends on, or `null` to ask nothing
 * @param ask performs the request, honouring the abort signal
 * @param cache where answers live for this session, one map per query
 * @param limit how many answers that map holds before the coldest is dropped
 *
 * @returns what this query knows right now
 */
export function useGraphQuery<T>(
    signature: string | null,
    ask: (signal: AbortSignal) => Promise<T>,
    cache: Map<string, T>,
    limit: number,
): GraphQuery<T> {
    const [query, setQuery] = useState<GraphQuery<T>>({ state: "idle", data: null, stale: false });

    useEffect(() => {
        if (signature === null) {
            setQuery({ state: "idle", data: null, stale: false });
            return;
        }
        const cached = readCache(cache, signature);
        if (cached !== undefined) {
            setQuery({ state: "ready", data: cached, stale: false });
            return;
        }
        // Keeps whatever is on screen, marked stale, rather than blanking it.
        setQuery((previous) => ({ state: "loading", data: previous.data, stale: previous.data !== null }));

        const abort = new AbortController();
        const timer = setTimeout(() => {
            ask(abort.signal)
                .then((data) => {
                    cache.set(signature, data);
                    if (cache.size > limit) {
                        for (const coldest of cache.keys()) {
                            cache.delete(coldest);
                            break;
                        }
                    }
                    setQuery({ state: "ready", data, stale: false });
                })
                .catch(() => {
                    // An aborted request means a newer effect took over — its
                    // own state must not be overwritten with "unavailable".
                    if (!abort.signal.aborted) setQuery({ state: "unavailable", data: null, stale: false });
                });
        }, GRAPH_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            abort.abort();
        };
        // Keyed on the signature alone: the caller builds it from everything
        // `ask` puts in the request body, which is the whole point of it.
    }, [signature]);

    return query;
}
