import { useEffect } from "react";
import { GraphApi } from "src/api/graph";
import { Diagnostics } from "src/api/graph-generated";
import { AdvisorDeck, advisorSignature } from "src/utils/deck-advisor";
import { GraphQuery, useGraphQuery } from "src/utils/use-graph-query";

/** Reports already computed this session, keyed by signature */
const CACHE = new Map<string, Diagnostics>();

/** How many reports the cache holds before the coldest goes */
const CACHE_LIMIT = 32;

/** Commanders whose EDHREC data was already prefetched this session */
const WARMED = new Set<string>();

/**
 * Asks the graph advisor to diagnose a deck.
 *
 * Keyed on {@link advisorSignature}: only an edit that changes the played
 * cards, the commander or the speed causes a request, which is what keeps a
 * printing swap or a maybeboard move from re-running the analysis.
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
export function useDeckAnalysis(deck: AdvisorDeck, speed: number, enabled: boolean): GraphQuery<Diagnostics> {
    const active = enabled && deck.entries.length > 0;

    const commander = deck.commander;
    useEffect(() => {
        if (!active || commander === null || WARMED.has(commander)) return;
        WARMED.add(commander);
        // Fire-and-forget: a failed warm-up costs a slower first suggestion
        // request, nothing else — but it may be retried later.
        GraphApi.warm({ commander_oracle_id: commander }).catch(() => WARMED.delete(commander));
    }, [active, commander]);

    return useGraphQuery(
        active ? advisorSignature(deck, speed) : null,
        (signal) =>
            GraphApi.diagnostics({ cards: deck.entries, speed, commander_oracle_id: deck.commander }, { signal }),
        CACHE,
        CACHE_LIMIT,
    );
}
