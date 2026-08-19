import { useEffect, useState } from "react";
import { GraphApi } from "src/api/graph";
import { CombosResponse } from "src/api/graph-generated";
import { AdvisorDeck } from "src/utils/deck-advisor";

/** How long the deck has to hold still before the graph is asked */
const DEBOUNCE_MS = 600;

/** Answers already computed this session, keyed by the played cards */
const CACHE = new Map<string, CombosResponse>();

/** How many answers the cache holds before the oldest goes */
const CACHE_LIMIT = 16;

/** What the combo section knows right now */
export type DeckCombos =
    /** Nothing to look for, or the caller has not opened the section */
    | { state: "idle" }
    /** The graph is being asked, or the debounce is still running */
    | { state: "loading" }
    /** Complete combos and the ones a single card short */
    | { state: "ready"; combos: CombosResponse }
    /** The graph did not answer — the deck itself is unaffected */
    | { state: "unavailable" };

/**
 * Asks the graph which combos the deck holds, debounced and cancelled on
 * change.
 *
 * Keyed on the played cards alone — combos are rules, not opinions, so
 * neither speed nor the ignore list can change the answer.
 *
 * @param deck the advisor's projection of the deck
 * @param names the played cards' names, for the pre-ingest fallback
 * @param enabled whether the section is on screen
 *
 * @returns what the combo section knows right now
 */
export function useDeckCombos(deck: AdvisorDeck, names: Array<string>, enabled: boolean): DeckCombos {
    const active = enabled && deck.entries.length > 0;
    const signature = active ? deck.entries.map((entry) => entry.oracle_id).join(",") : null;
    const [result, setResult] = useState<DeckCombos>({ state: "idle" });

    useEffect(() => {
        if (signature === null) {
            setResult({ state: "idle" });
            return;
        }
        const cached = CACHE.get(signature);
        if (cached !== undefined) {
            setResult({ state: "ready", combos: cached });
            return;
        }
        setResult({ state: "loading" });
        const abort = new AbortController();
        const timer = setTimeout(() => {
            GraphApi.combos({ cards: deck.entries, card_names: names }, { signal: abort.signal })
                .then((combos) => {
                    CACHE.set(signature, combos);
                    if (CACHE.size > CACHE_LIMIT) {
                        for (const oldest of CACHE.keys()) {
                            CACHE.delete(oldest);
                            break;
                        }
                    }
                    setResult({ state: "ready", combos });
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
        // Keyed on the signature alone — the names describe the same cards.
    }, [signature]);

    return result;
}
