import { useEffect, useState } from "react";
import { GraphApi } from "src/api/graph";
import { SwapsResponse } from "src/api/graph-generated";
import { AdvisorDeck, advisorSignature } from "src/utils/deck-advisor";

/** How long the deck has to hold still before the graph is asked */
const DEBOUNCE_MS = 600;

/** Answers already computed this session, keyed by signature */
const CACHE = new Map<string, SwapsResponse>();

/** How many answers the cache holds before the oldest goes */
const CACHE_LIMIT = 16;

/** How many adds the report is asked for */
const LIMIT = 30;

/** How many cut candidates each add is paired with */
const PER_ADD = 2;

/** What the suggestion side of the advisor knows right now */
export type DeckSwaps =
    /** Nothing to suggest for, or the caller has not opened the section */
    | { state: "idle" }
    /** The graph is being asked, or the debounce is still running */
    | { state: "loading" }
    /** Adds, cuts and their pairings */
    | { state: "ready"; swaps: SwapsResponse }
    /** The graph did not answer — the deck itself is unaffected */
    | { state: "unavailable" };

/**
 * Asks the graph for adds, cuts and swaps, debounced and cancelled on change.
 *
 * The same contract as `useDeckAnalysis`: keyed on the advisor signature so
 * only a change to the played cards, the commander or the speed causes a
 * request, aborted when a newer deck state supersedes it, cached per session.
 *
 * `enabled` gates the fetch on the section actually being open — suggestions
 * are an order of magnitude more expensive than diagnostics and are not
 * computed for a tab nobody is looking at.
 *
 * @param deck the advisor's projection of the deck
 * @param speed the speed to suggest at, 0 to 1
 * @param excluded oracle ids the deck's ignore list rules out
 * @param enabled whether the suggestions are on screen
 *
 * @returns what the suggestion side knows right now
 */
export function useDeckSwaps(deck: AdvisorDeck, speed: number, excluded: Array<string>, enabled: boolean): DeckSwaps {
    const active = enabled && deck.entries.length > 0;
    const signature = active ? `${advisorSignature(deck, speed)};x:${[...excluded].sort().join(",")}` : null;
    const [result, setResult] = useState<DeckSwaps>({ state: "idle" });

    useEffect(() => {
        if (signature === null) {
            setResult({ state: "idle" });
            return;
        }
        const cached = CACHE.get(signature);
        if (cached !== undefined) {
            setResult({ state: "ready", swaps: cached });
            return;
        }
        setResult({ state: "loading" });
        const abort = new AbortController();
        const timer = setTimeout(() => {
            GraphApi.swaps(
                {
                    cards: deck.entries,
                    speed,
                    commander_oracle_id: deck.commander,
                    limit: LIMIT,
                    per_add: PER_ADD,
                    excluded,
                },
                { signal: abort.signal },
            )
                .then((swaps) => {
                    CACHE.set(signature, swaps);
                    if (CACHE.size > CACHE_LIMIT) {
                        for (const oldest of CACHE.keys()) {
                            CACHE.delete(oldest);
                            break;
                        }
                    }
                    setResult({ state: "ready", swaps });
                })
                .catch(() => {
                    // An aborted request means a newer effect took over — its
                    // own state must not be overwritten with "unavailable".
                    if (!abort.signal.aborted) setResult({ state: "unavailable" });
                });
        }, DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            abort.abort();
        };
        // Keyed on the signature alone: it covers everything the request is
        // built from, which is exactly the point of it.
    }, [signature]);

    return result;
}
