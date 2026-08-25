import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
 * Holds `value` back until it stops changing for `delayMs`.
 *
 * Starts at `null` rather than at `value`, so the very first non-null value a
 * caller ever passes is debounced too — the same 600ms grace the deck editor
 * gets on every later edit. A transition back to `null` (the section going
 * idle) is not debounced: there is nothing left to ask, so there is nothing
 * to wait for.
 *
 * @param value the latest value
 * @param delayMs how long `value` has to hold still before it is reported
 *
 * @returns the debounced value
 */
function useDebounced(value: string | null, delayMs: number): string | null {
    const [debounced, setDebounced] = useState<string | null>(null);

    useEffect(() => {
        if (value === null) {
            setDebounced(null);
            return;
        }
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}

/**
 * Asks the graph advisor one question, debounced, abortable and cached.
 *
 * A thin adapter over TanStack Query: the debounce is the only piece it has
 * to hand-roll, everything else — abort on key change, stale-while-revalidate,
 * session-long caching — is `useQuery` doing what it already does. The
 * `GraphQuery<T>` contract this returns is what every advisor panel renders
 * against, so callers never see TanStack's own vocabulary.
 *
 * Every query shares the `graph-query` key prefix, so an event that changes
 * what the service would say without changing the deck — a background EDHREC
 * warm landing, see {@link useEdhrecWarm} — can invalidate all of them at once
 * rather than each panel having to poll for itself.
 *
 * @param signature everything the answer depends on, or `null` to ask nothing
 * @param ask performs the request, honouring the abort signal
 *
 * @returns what this query knows right now
 */
export function useGraphQuery<T>(signature: string | null, ask: (signal: AbortSignal) => Promise<T>): GraphQuery<T> {
    const debounced = useDebounced(signature, GRAPH_DEBOUNCE_MS);

    const query = useQuery({
        queryKey: ["graph-query", debounced],
        queryFn: ({ signal }) => ask(signal),
        enabled: debounced !== null,
        // The previous answer stands in while the next one is computed,
        // instead of the panel blanking on every edit.
        placeholderData: keepPreviousData,
    });

    if (debounced === null) return { state: "idle", data: null, stale: false };

    // A newer signature is already waiting out its own debounce, or the
    // current answer is a carried-over placeholder for the debounced key.
    const stale = signature !== debounced || query.isPlaceholderData;

    if (query.status === "pending") return { state: "loading", data: query.data ?? null, stale };
    // Today's contract clears data on failure rather than showing a stale
    // answer next to an error.
    if (query.status === "error") return { state: "unavailable", data: null, stale: false };
    return { state: "ready", data: query.data, stale };
}
