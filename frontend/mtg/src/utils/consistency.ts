/**
 * The consistency math a competitive player already works out by hand —
 * Task D of the cEDH Pro round (`implementation-plans/cedh-pro/00-OVERVIEW.md`,
 * `TASK-D-CONSISTENCY-MATH.md`). Mean mana value to the decimal, "how often
 * do I see a fast-mana piece in my opener", "how often have I found a tutor
 * by turn 3" — all of it hypergeometric arithmetic over counts the service
 * already knows (`Diagnostics.cedh_stats`, `diagnostics.py`) or that Task G
 * joins in from the line engine (B) and the interaction grid (C).
 *
 * Pure and framework-free on purpose (overview decision 4: "consistency math
 * is computed in the frontend from counts the backend already exposes...
 * hypergeometric arithmetic does not need a round trip"). No i18n, no React,
 * no coupling to the line engine's or the interaction grid's own shapes —
 * every function here takes plain numbers (or, for `meanManaValue`, the
 * minimal card shape it actually needs), so a caller can feed it a fast-mana
 * count, a tutor count, or a line-piece count identically.
 *
 * Drawing convention, used by every "opening hand" / "by turn" number below:
 * **on the play**. The opening hand is 7 cards; by turn `T` the player has
 * seen `7 + (T − 1)` cards, because there is no draw step on turn 1 when you
 * are on the play. `byTurn(1)` is therefore identical to the opening-hand
 * number itself.
 *
 * The distribution itself is not reimplemented here. `src/utils/hypergeometric.ts`
 * already carries an exact, log-space, unit-tested "drawing without
 * replacement" engine for the deck-statistics tab's land-screw/color-odds
 * panel (`deck-odds.ts`) — a second independent implementation of the same
 * arithmetic a few files away is how two panels end up quoting different
 * odds for the same deck. `hypergeomAtLeast` below is a thin, argument-
 * reordered wrapper around its `atLeast`, adding only the clamping this
 * module's callers need that `deck-odds.ts` never exercised (see its own
 * doc comment) — its opening-hand and by-turn draws never exceed the deck
 * size, so it had no reason to guard for one that does.
 */

import { atLeast } from "src/utils/hypergeometric";

/**
 * `P(X >= k)` drawing `n` cards from an `N`-card deck holding `K` successes —
 * the number behind every "how often have I seen this by now" figure in the
 * panel. `src/utils/hypergeometric.ts`'s `atLeast(population, successes,
 * draws, wanted)` restated in the `(k, K, N, n)` order this module (and the
 * task file it implements) uses throughout.
 *
 * Degenerate inputs are clamped rather than thrown on, because every caller
 * in this module derives them from a real decklist and a real turn count,
 * and a slightly out-of-range input (a deck under 99, a turn past when the
 * library runs out) has an honest answer rather than an error — clamps
 * `atLeast` itself does not need, since its own callers (`deck-odds.ts`)
 * never draw more cards than the deck holds:
 * - `K` and `n` are clamped into `[0, N]` — `n` past the deck size reads as
 *   "the whole deck has been seen", not as a broken binomial coefficient.
 * - `N <= 0` (no deck) reads as `0`, never `NaN`.
 * - `k <= 0` ("at least zero successes") is always `1`.
 *
 * @param k the minimum number of successes asked about
 * @param K how many successes the deck holds
 * @param N the deck size
 * @param n how many cards have been seen
 *
 * @returns the probability, in `[0, 1]`
 */
export function hypergeomAtLeast(k: number, K: number, N: number, n: number): number {
    if (N <= 0) return 0;

    const successes = Math.min(Math.max(K, 0), N);
    const seen = Math.min(Math.max(n, 0), N);
    const need = Math.max(k, 0);

    if (need === 0) return 1;
    return atLeast(N, successes, seen, need);
}

/** `P(>= 1)` for the opening hand, and for every turn count asked of it */
export type OpeningHandOdds = {
    /** `P(>= 1 in the opening 7-card hand)` */
    openingHand: number;
    /**
     * `P(>= 1 by turn `turn`)`, under the on-the-play convention stated at
     * the top of this file — turn 1 is the opening hand alone.
     *
     * @param turn the turn number, 1-indexed
     *
     * @returns the probability, in `[0, 1]`
     */
    byTurn: (turn: number) => number;
};

/**
 * How often a card class (fast mana, tutors, a line's pieces — anything
 * countable) shows up early, both in the opening hand and by a given turn.
 *
 * @param classCount how many copies of the class the deck holds
 * @param deckSize the deck size drawn from (99 for a normal Commander deck)
 *
 * @returns the opening-hand probability, plus a function for "by turn T"
 */
export function openingHandOdds(classCount: number, deckSize: number): OpeningHandOdds {
    return {
        openingHand: hypergeomAtLeast(1, classCount, deckSize, 7),
        byTurn: (turn: number) => hypergeomAtLeast(1, classCount, deckSize, 7 + Math.max(0, turn - 1)),
    };
}

/** The minimal shape `meanManaValue` needs from a card — nothing else of a real card is read */
export type ManaCard = {
    /** The card's mana value (cmc). Ignored for a land — see `meanManaValue` */
    manaValue: number;
    /** How many copies */
    qty: number;
    /** Lands have no meaningful cost and would drag the average toward zero */
    isLand: boolean;
};

/**
 * The deck's mean mana value — nonland, quantity-weighted, one decimal.
 *
 * The number a cEDH pilot already knows for their own list ("this deck lives
 * at about 1.8") and the 0–6+ curve histogram cannot express, because it
 * buckets everything at 6 or above into one column. Mirrors
 * `Diagnostics.average_mv` / `cedh_stats.mean_mana_value`'s own arithmetic
 * exactly (`diagnostics.py`'s `build_diagnostics`) — this is the client-side
 * twin for a caller that already holds the card list locally and would
 * rather not wait on a round trip for one number.
 *
 * @param cards the deck's cards, lands included (and excluded here)
 *
 * @returns the mean mana value to one decimal, or `null` with no nonland cards
 */
export function meanManaValue(cards: ReadonlyArray<ManaCard>): number | null {
    let weighted = 0;
    let count = 0;
    for (const card of cards) {
        if (card.isLand) continue;
        weighted += card.manaValue * card.qty;
        count += card.qty;
    }
    if (count <= 0) return null;
    return Math.round((weighted / count) * 10) / 10;
}

/**
 * `P(>= 1)` across an opening hand plus up to `maxMulligans` free mulligans —
 * London-style, keep-any-7.
 *
 * Simplified on purpose: each mulligan is treated as an independent fresh
 * 7-card draw from the whole deck (the library is fully reshuffled between
 * attempts, so this is the honest model rather than an approximation of a
 * harder one) and "free" means no card is bottomed for having mulliganed —
 * the question this answers is "how often do I find it before I have to
 * keep", not "what does keeping this hand cost me". A real London mulligan
 * does cost a card per mulligan taken; that cost does not change *whether*
 * the class was found, only what the kept hand looks like afterward, which
 * is outside what this number claims to say.
 *
 * @param classCount how many copies of the class the deck holds
 * @param deckSize the deck size drawn from
 * @param maxMulligans how many free mulligans are available (0 = the plain opening-hand number)
 *
 * @returns the probability of seeing the class in at least one of the hands, in `[0, 1]`
 */
export function mulliganAdjusted(classCount: number, deckSize: number, maxMulligans: number): number {
    const missOnce = 1 - hypergeomAtLeast(1, classCount, deckSize, 7);
    const attempts = Math.max(0, maxMulligans) + 1;
    return 1 - missOnce ** attempts;
}
