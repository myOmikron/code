import { GraphApi } from "src/api/graph";
import { SwapsResponse } from "src/api/graph-generated";
import { AdvisorDeck, advisorSignature } from "src/utils/deck-advisor";
import { ThemePrefs, themePrefsKey } from "src/utils/deck-theme-prefs";
import { GraphQuery, useGraphQuery } from "src/utils/use-graph-query";

/**
 * How many adds the report is asked for.
 *
 * More than the view shows. An add whose every role-sharing partner is a better
 * card than it drops out of the pairing rather than being offered as a
 * downgrade, so the pool has to run deeper than the answer. Costs nothing
 * measurable — the backend ranks the same candidates either way and the limit
 * only truncates.
 */
const LIMIT = 45;

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
 * @param protectedIds oracle ids the advisor talked the user into this session
 * @param commanderIds every card the deck fields as a commander (partners,
 *   backgrounds) — the backend defends these itself, this only has to name them
 * @param enabled whether the suggestions are on screen
 *
 * @returns what the suggestion side knows right now
 */
export function useDeckSwaps(
    deck: AdvisorDeck,
    speed: number,
    excluded: Array<string>,
    themes: ThemePrefs,
    protectedIds: Array<string>,
    commanderIds: Array<string>,
    enabled: boolean,
): GraphQuery<SwapsResponse> {
    const active = enabled && deck.entries.length > 0;

    return useGraphQuery(
        active
            ? [
                  advisorSignature(deck, speed),
                  `x:${[...excluded].sort().join(",")}`,
                  themePrefsKey(themes),
                  // In the key: a newly protected card changes which cuts come
                  // back, so a cached answer from before it was accepted is
                  // the wrong answer rather than a stale one.
                  `p:${[...protectedIds].sort().join(",")}`,
                  `c:${commanderIds.join(",")}`,
              ].join(";")
            : null,
        (signal) =>
            GraphApi.swaps(
                {
                    cards: deck.entries,
                    speed,
                    commander_oracle_id: deck.commander,
                    commander_oracle_ids: commanderIds,
                    limit: LIMIT,
                    per_add: PER_ADD,
                    excluded,
                    pinned_themes: themes.pinned,
                    excluded_themes: themes.excluded,
                    keep: protectedIds,
                },
                { signal },
            ),
        {
            // A cold commander's EDHREC data warms up server-side (Task 12)
            // rather than blocking this request — polling here is what turns
            // that background warm into an answer that refines itself without
            // the reader having to touch anything.
            refetchWhile: (data) => (data.suggestions.notes ?? []).some((note) => note.code === "edhrec-pending"),
        },
    );
}
