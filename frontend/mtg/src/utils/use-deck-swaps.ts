import { GraphApi } from "src/api/graph";
import { SwapsResponse } from "src/api/graph-generated";
import { AdvisorDeck, advisorSignature } from "src/utils/deck-advisor";
import { ThemePrefs, themePrefsKey } from "src/utils/deck-theme-prefs";
import { GraphQuery, useGraphQuery } from "src/utils/use-graph-query";

/** Answers already computed this session, keyed by signature */
const CACHE = new Map<string, SwapsResponse>();

/** How many answers the cache holds before the coldest goes */
const CACHE_LIMIT = 16;

/** How many adds the report is asked for */
const LIMIT = 30;

/** How many cut candidates each add is paired with */
const PER_ADD = 2;

/**
 * Asks the graph for adds, cuts and swaps.
 *
 * Same contract as {@link useDeckAnalysis}, plus the ignore list — which
 * belongs in the key because it changes the answer.
 *
 * `enabled` gates the fetch on the section actually being open: suggestions
 * are an order of magnitude more expensive than diagnostics and are not
 * computed for a tab nobody is looking at.
 *
 * @param deck the advisor's projection of the deck
 * @param speed the speed to suggest at, 0 to 1
 * @param excluded oracle ids the deck's ignore list rules out
 * @param themes the themes to argue for and against
 * @param enabled whether the suggestions are on screen
 *
 * @returns what the suggestion side knows right now
 */
export function useDeckSwaps(
    deck: AdvisorDeck,
    speed: number,
    excluded: Array<string>,
    themes: ThemePrefs,
    enabled: boolean,
): GraphQuery<SwapsResponse> {
    const active = enabled && deck.entries.length > 0;

    return useGraphQuery(
        active
            ? [advisorSignature(deck, speed), `x:${[...excluded].sort().join(",")}`, themePrefsKey(themes)].join(";")
            : null,
        (signal) =>
            GraphApi.swaps(
                {
                    cards: deck.entries,
                    speed,
                    commander_oracle_id: deck.commander,
                    limit: LIMIT,
                    per_add: PER_ADD,
                    excluded,
                    pinned_themes: themes.pinned,
                    excluded_themes: themes.excluded,
                },
                { signal },
            ),
        CACHE,
        CACHE_LIMIT,
    );
}
