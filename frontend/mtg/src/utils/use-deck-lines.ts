import { GraphApi } from "src/api/graph";
import { LineReportResponse } from "src/api/graph-generated";
import { AdvisorDeck } from "src/utils/deck-advisor";
import { GraphQuery, useGraphQuery } from "src/utils/use-graph-query";

/**
 * Below this speed the advisor is not a lines-first cockpit — a casual deck
 * gets today's shape-first presentation and must not pay for a `/lines`
 * round trip it will never render. Bracket 5's own speed (`bracketSpeed(5)`
 * is `1.0`; bracket 4 is `0.75`), so this is exactly "claimed bracket 5, or
 * assumed there by a deck that leans hard enough on its house rules".
 *
 * Shared by every cEDH-cockpit gate — this hook, the route's panel branch,
 * and the suggestions gallery's group reordering — so the threshold is one
 * number, not four copies of it drifting apart.
 */
export const CEDH_COCKPIT_MIN_SPEED = 0.8;

/**
 * Whether the cEDH cockpit applies at all, at this speed.
 *
 * The one gate every cEDH surface shares: the route's panel branch (renders
 * {@link DeckAdvisorLines} and friends instead of today's shape-first
 * cockpit), this hook's own fetch guard below, and the suggestions
 * gallery's line/interaction-group reordering all call this rather than
 * comparing to {@link CEDH_COCKPIT_MIN_SPEED} themselves — so "does the
 * cEDH cockpit mount here" has exactly one answer, tested once.
 *
 * @param speed the deck's bracket speed, 0 to 1
 *
 * @returns whether the cEDH presentation is in force
 */
export function cedhCockpitApplies(speed: number): boolean {
    return speed >= CEDH_COCKPIT_MIN_SPEED;
}

/**
 * Asks the graph for the deck's complete combo lines, near-misses, tutor
 * reach and redundancy — the cEDH cockpit's lines panel.
 *
 * Gated on `speed` as well as `enabled`, unlike {@link useDeckCombos}
 * (`src/utils/use-deck-combos.ts`): a combo read is cheap and the casual
 * advisor still renders a combo-completion suggestion off it, but `/lines`
 * costs the service a real solve over cost/zone/prerequisite data nothing
 * below bracket 5 reads, so a deck under {@link CEDH_COCKPIT_MIN_SPEED} must
 * not fire the request at all.
 *
 * Keyed the same way {@link useDeckCombos} is (played cards, the ignore
 * list, commanders, claimed colours) — the line report is exactly as
 * rules-shaped as the combo report it is built from, so the same signature
 * discipline applies. Speed itself does not ride the key: like combos, a
 * line's cost and reachability are rules, not opinions, so a bracket edit
 * that stays at or above the threshold must not force a refetch.
 *
 * @param deck the advisor's projection of the deck
 * @param speed the deck's bracket speed, 0 to 1 — gates the request at {@link CEDH_COCKPIT_MIN_SPEED}
 * @param excluded oracle ids the deck's ignore list rules out
 * @param enabled whether the advisor is open at all
 *
 * @returns what the lines panel knows right now
 */
export function useDeckLines(
    deck: AdvisorDeck,
    speed: number,
    excluded: Array<string>,
    enabled: boolean,
): GraphQuery<LineReportResponse> {
    const active = enabled && cedhCockpitApplies(speed) && deck.entries.length > 0;
    const signature = active
        ? [
              deck.entries.map((entry) => entry.oracle_id).join(","),
              [...excluded].sort().join(","),
              deck.commanders.join("+"),
              deck.identity?.join("") ?? "-",
          ].join(";")
        : null;

    return useGraphQuery(signature, (signal) =>
        GraphApi.lines(
            {
                cards: deck.entries,
                excluded,
                commander_oracle_ids: deck.commanders,
                identity: deck.identity,
            },
            { signal },
        ),
    );
}
