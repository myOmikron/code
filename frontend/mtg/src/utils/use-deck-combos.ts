import { GraphApi } from "src/api/graph";
import { CombosResponse } from "src/api/graph-generated";
import { AdvisorDeck } from "src/utils/deck-advisor";
import { GraphQuery, useGraphQuery } from "src/utils/use-graph-query";

/**
 * Asks the graph which combos the deck holds.
 *
 * Keyed on the played cards, their names and the ignore list. Speed cannot
 * change the answer — combos are rules, not opinions — but the ignore list
 * can: `one_short` is a recommendation to add a card, so an ignored card must
 * not come back through this door. The names ride the key because they are
 * sent, and they cover slots whose printing the catalog cannot place, which
 * the oracle ids by definition do not.
 *
 * @param deck the advisor's projection of the deck
 * @param names the played cards' names, for the pre-ingest fallback
 * @param excluded oracle ids the deck's ignore list rules out
 * @param enabled whether the section is on screen
 *
 * @returns what the combo section knows right now
 */
export function useDeckCombos(
    deck: AdvisorDeck,
    names: Array<string>,
    excluded: Array<string>,
    enabled: boolean,
): GraphQuery<CombosResponse> {
    const active = enabled && deck.entries.length > 0;
    // The separator is a character no card name and no uuid can hold, so two
    // different lists cannot fold into one key.
    const signature = active
        ? [
              deck.entries.map((entry) => entry.oracle_id).join(","),
              names.join("\n"),
              [...excluded].sort().join(","),
          ].join(";")
        : null;

    return useGraphQuery(signature, (signal) =>
        GraphApi.combos({ cards: deck.entries, card_names: names, excluded }, { signal }),
    );
}
