import { GraphApi } from "src/api/graph";
import { CombosResponse } from "src/api/graph-generated";
import { AdvisorDeck } from "src/utils/deck-advisor";
import { GraphQuery, useGraphQuery } from "src/utils/use-graph-query";

/**
 * Asks the graph which combos the deck holds.
 *
 * Keyed on the played cards, their names, the ignore list and the colours the
 * deck may play. Speed cannot change the answer — combos are rules, not
 * opinions — but the ignore list can: `one_short` is a recommendation to add
 * a card, so an ignored card must not come back through this door. The names
 * ride the key because they are sent, and they cover slots whose printing the
 * catalog cannot place, which the oracle ids by definition do not.
 *
 * The command zone and the deck's Rule 0 claim ride along for the same reason
 * every other advisor call carries them: a missing piece outside the deck's
 * colours is a card it cannot legally play, and the service drops it. `null`
 * stays `null` — the graph derives the colours from the commanders itself,
 * exactly as /suggestions does.
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
              deck.commanders.join("+"),
              deck.identity?.join("") ?? "-",
          ].join(";")
        : null;

    return useGraphQuery(signature, (signal) =>
        GraphApi.combos(
            {
                cards: deck.entries,
                card_names: names,
                excluded,
                commander_oracle_ids: deck.commanders,
                identity: deck.identity,
            },
            { signal },
        ),
    );
}
