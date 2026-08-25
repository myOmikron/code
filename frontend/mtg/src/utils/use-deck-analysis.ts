import { useEffect } from "react";
import { GraphApi } from "src/api/graph";
import { Diagnostics } from "src/api/graph-generated";
import { AdvisorDeck, advisorSignature } from "src/utils/deck-advisor";
import { GraphQuery, useGraphQuery } from "src/utils/use-graph-query";

/** Commanders whose EDHREC data was already prefetched this session */
const WARMED = new Set<string>();

/**
 * Asks the graph advisor to diagnose a deck.
 *
 * Keyed on {@link advisorSignature}: only an edit that changes the played
 * cards, the commanders, the claimed colours, the deck's size or the speed
 * causes a request, which is what keeps a printing swap or a maybeboard move
 * from re-running the analysis.
 *
 * Choosing a commander also fires the server's EDHREC prefetch, once per
 * commander per session, so the empirical signal is usually warm by the time
 * suggestions are asked for. Every commander is warmed, not only the anchor:
 * a Partner deck is read against both pages.
 *
 * @param deck the advisor's projection of the deck
 * @param speed the speed to analyse at, 0 to 1
 * @param enabled whether the advisor applies here at all (Commander decks)
 *
 * @returns what the advisor knows right now
 */
export function useDeckAnalysis(deck: AdvisorDeck, speed: number, enabled: boolean): GraphQuery<Diagnostics> {
    const active = enabled && deck.entries.length > 0;

    const commanders = deck.commanders;
    const warmKey = commanders.join(",");
    useEffect(() => {
        if (!active) return;
        for (const commander of commanders) {
            if (WARMED.has(commander)) continue;
            WARMED.add(commander);
            // Fire-and-forget: a failed warm-up costs a slower first suggestion
            // request, nothing else — but it may be retried later.
            GraphApi.warm({ commander_oracle_id: commander }).catch(() => WARMED.delete(commander));
        }
    }, [active, warmKey]);

    return useGraphQuery(active ? advisorSignature(deck, speed) : null, (signal) =>
        GraphApi.diagnostics(
            {
                cards: deck.entries,
                speed,
                commander_oracle_id: deck.commander,
                commander_oracle_ids: deck.commanders,
                // Every quota the diagnosis grades against scales with this.
                deck_size: deck.deckSize ?? undefined,
            },
            { signal },
        ),
    );
}
