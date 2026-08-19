import { useEffect, useState } from "react";
import { GraphApi } from "src/api/graph";
import { Diagnostics } from "src/api/graph-generated";
import { AdvisorDeck, advisorSignature } from "src/utils/deck-advisor";

/** How long the deck has to hold still before the graph is asked */
const DEBOUNCE_MS = 600;

/** Reports already computed this session, keyed by signature */
const CACHE = new Map<string, Diagnostics>();

/** How many reports the cache holds before the oldest goes */
const CACHE_LIMIT = 32;

/** Commanders whose EDHREC data was already prefetched this session */
const WARMED = new Set<string>();

/** What the advisor knows right now */
export type DeckAnalysis =
    /** Nothing to analyse, or the caller turned the advisor off */
    | { state: "idle" }
    /** The graph is being asked, or the debounce is still running */
    | { state: "loading" }
    /** The report, fresh or from the session cache */
    | { state: "ready"; diagnostics: Diagnostics }
    /** The graph did not answer — the deck itself is unaffected */
    | { state: "unavailable" };

/**
 * Asks the graph advisor about a deck, debounced and cancelled on change.
 *
 * Keyed on {@link advisorSignature}: only an edit that changes the played
 * cards, the commander or the speed causes a request. An edit arriving while
 * one is in flight aborts it — the answer to a deck that no longer exists is
 * not worth having. Answers are cached per session, so tabbing away and back
 * is free.
 *
 * Choosing a commander also fires the server's EDHREC prefetch, once per
 * commander per session, so the empirical signal is usually warm by the time
 * suggestions are asked for.
 *
 * @param deck the advisor's projection of the deck
 * @param speed the speed to analyse at, 0 to 1
 * @param enabled whether the advisor applies here at all (Commander decks)
 *
 * @returns what the advisor knows right now
 */
export function useDeckAnalysis(deck: AdvisorDeck, speed: number, enabled: boolean): DeckAnalysis {
    const active = enabled && deck.entries.length > 0;
    const signature = active ? advisorSignature(deck, speed) : null;
    const [analysis, setAnalysis] = useState<DeckAnalysis>({ state: "idle" });

    const commander = deck.commander;
    useEffect(() => {
        if (!active || commander === null || WARMED.has(commander)) return;
        WARMED.add(commander);
        // Fire-and-forget: a failed warm-up costs a slower first suggestion
        // request, nothing else — but it may be retried later.
        GraphApi.warm({ commander_oracle_id: commander }).catch(() => WARMED.delete(commander));
    }, [active, commander]);

    useEffect(() => {
        if (signature === null) {
            setAnalysis({ state: "idle" });
            return;
        }
        const cached = CACHE.get(signature);
        if (cached !== undefined) {
            setAnalysis({ state: "ready", diagnostics: cached });
            return;
        }
        setAnalysis({ state: "loading" });
        const abort = new AbortController();
        const timer = setTimeout(() => {
            GraphApi.diagnostics(
                {
                    cards: deck.entries,
                    speed,
                    commander_oracle_id: deck.commander,
                },
                { signal: abort.signal },
            )
                .then((diagnostics) => {
                    CACHE.set(signature, diagnostics);
                    if (CACHE.size > CACHE_LIMIT) {
                        for (const oldest of CACHE.keys()) {
                            CACHE.delete(oldest);
                            break;
                        }
                    }
                    setAnalysis({ state: "ready", diagnostics });
                })
                .catch(() => {
                    // An aborted request means a newer effect took over — its
                    // own state must not be overwritten with "unavailable".
                    if (!abort.signal.aborted) setAnalysis({ state: "unavailable" });
                });
        }, DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            abort.abort();
        };
        // Keyed on the signature alone: it covers everything the request is
        // built from, which is exactly the point of it.
    }, [signature]);

    return analysis;
}
