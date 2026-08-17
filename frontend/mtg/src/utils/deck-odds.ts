/**
 * What a deck is likely to do, rather than what it contains.
 *
 * Two questions decide whether a deck functions, and neither is answered by
 * counting cards. How often does the opening hand work, and can each card
 * actually be cast on the turn it wants to be. Both are exact draws without
 * replacement, so both are arithmetic — see `hypergeometric.ts`.
 */

import type { DeckCardResponse } from "src/api/generated";
import { primaryType } from "src/utils/card-types";
import { atLeast, exactly } from "src/utils/hypergeometric";

/** How many cards an opening hand holds */
const HAND = 7;

/** Below this, a card counts as short of the colours it needs */
export const SUPPORT_THRESHOLD = 0.9;

/** How many under-supported cards are named */
const WORST_LIMIT = 8;

/** The colours, in the order they are written */
const COLOR_LETTERS = ["W", "U", "B", "R", "G"];

/** The fewest lands a hand is kept on */
const KEEP_LOW = 2;

/** The most lands a hand is kept on */
const KEEP_HIGH = 4;

/** What a hand is called, by how many lands it holds */
export type HandVerdict = "screwed" | "half" | "good" | "flooded";

/** The ranges the summary under the distribution folds the hand into */
const SUMMARY_BUCKETS: Array<{ verdict: HandVerdict; low: number; high: number }> = [
    { verdict: "screwed", low: 0, high: 1 },
    { verdict: "half", low: 2, high: 2 },
    { verdict: "good", low: 3, high: 4 },
    { verdict: "flooded", low: 5, high: HAND },
];

/** How often a hand ends up holding each number of lands */
export type HandOutcome = {
    /** The chance of exactly this many lands, one entry per possible count */
    distribution: Array<{ lands: number; chance: number }>;
    /** The chance of a hand that is kept, two to four lands */
    keepable: number;
    /** The chance of each of the four verdicts */
    summary: Array<{ verdict: HandVerdict; chance: number }>;
};

/** How the opening hand tends to look */
export type OpeningHand = {
    /** How many cards the deck holds, the commander aside */
    deckSize: number;
    /** How many of those are lands */
    lands: number;
    /** The chance of at least one source of each colour the deck plays */
    colors: Array<{ key: string; chance: number }>;
    /** The first seven cards, taken as they come */
    first: HandOutcome;
    /** The hand that is kept when the first one may be thrown away for free */
    mulliganed: HandOutcome;
};

/** A card that may not have its colours when it wants them */
export type ThinSupport = {
    /** The slot */
    uuid: string;
    /** The card's name */
    name: string;
    /** Which colour it is short of */
    color: string;
    /** How many symbols of that colour it asks for */
    wanted: number;
    /** How many sources of that colour the deck plays */
    sources: number;
    /** The turn it wants to be cast on */
    turn: number;
    /** The chance of having the sources by then */
    chance: number;
};

/** Everything the odds panel draws */
export type DeckOdds = {
    /** How the opening hand tends to look */
    opening: OpeningHand;
    /** The cards least likely to have their colours in time */
    thin: Array<ThinSupport>;
    /** How many cards were checked for their colours */
    checked: number;
};

/**
 * Work out what the deck is likely to do
 *
 * The commander is left out of the deck it is drawn from, because it is not in
 * there: a Commander deck draws from ninety-nine.
 *
 * @param cards the deck's slots
 * @param colors the colours the deck may play
 *
 * @returns the odds
 */
export function deckOdds(cards: Array<DeckCardResponse>, colors: Array<string>): DeckOdds {
    const library = cards.filter((card) => card.zone === "Main");
    const deckSize = library.reduce((sum, card) => sum + card.quantity, 0);

    let lands = 0;
    const sources = new Map<string, number>();
    for (const slot of library) {
        const card = slot.card;
        if (card == null) continue;
        if (primaryType(card.type_line) === "land") lands += slot.quantity;
        for (const color of card.produced_mana) {
            if (COLOR_LETTERS.includes(color)) sources.set(color, (sources.get(color) ?? 0) + slot.quantity);
        }
    }

    const first = outcome(
        Array.from({ length: HAND + 1 }, (_, count) => ({
            lands: count,
            chance: exactly(deckSize, lands, HAND, count),
        })),
    );

    const opening: OpeningHand = {
        deckSize,
        lands,
        colors: colors.map((color) => ({
            key: color,
            chance: atLeast(deckSize, sources.get(color) ?? 0, HAND, 1),
        })),
        first,
        mulliganed: afterFreeMulligan(first),
    };

    const thin: Array<ThinSupport> = [];
    let checked = 0;

    for (const slot of library) {
        const card = slot.card;
        if (card == null || primaryType(card.type_line) === "land") continue;

        const wanted = colorRequirements(card.mana_cost);
        if (wanted.size === 0) continue;
        checked += 1;

        // A card wants to be cast on the turn its mana value comes up, and by
        // then a player on the play has seen the opening hand plus one card per
        // turn since.
        const turn = Math.max(1, Math.round(card.mana_value));
        const seen = HAND + turn - 1;

        for (const [color, count] of wanted) {
            const available = sources.get(color) ?? 0;
            const chance = atLeast(deckSize, available, seen, count);
            if (chance >= SUPPORT_THRESHOLD) continue;
            thin.push({
                uuid: slot.uuid,
                name: card.name,
                color,
                wanted: count,
                sources: available,
                turn,
                chance,
            });
        }
    }

    thin.sort((left, right) => left.chance - right.chance);

    return { opening, thin: thin.slice(0, WORST_LIMIT), checked };
}

/**
 * Add up the ranges a hand falls into
 *
 * @param distribution the chance of each land count
 *
 * @returns the distribution with its summaries
 */
function outcome(distribution: Array<{ lands: number; chance: number }>): HandOutcome {
    const sum = (low: number, high: number) =>
        distribution.reduce(
            (total, entry) => (entry.lands >= low && entry.lands <= high ? total + entry.chance : total),
            0,
        );

    return {
        distribution,
        keepable: sum(KEEP_LOW, KEEP_HIGH),
        summary: SUMMARY_BUCKETS.map((bucket) => ({
            verdict: bucket.verdict,
            chance: sum(bucket.low, bucket.high),
        })),
    };
}

/**
 * What a hand with this many lands is called
 *
 * @param lands how many lands the hand holds
 *
 * @returns the verdict the summary counts it under
 */
export function verdictFor(lands: number): HandVerdict {
    return SUMMARY_BUCKETS.find((bucket) => lands >= bucket.low && lands <= bucket.high)?.verdict ?? "flooded";
}

/**
 * The same hand, with the first one thrown away for free when it is unkeepable
 *
 * A free mulligan is a house rule rather than the format's, but a common one:
 * the first hand goes back without costing a card, so a hand outside two to
 * four lands is redrawn and the second seven are kept whatever they hold. The
 * deck is shuffled in between, so the second hand is drawn from the same
 * distribution as the first and the two simply fold together.
 *
 * @param first how the first seven cards come out
 *
 * @returns how the kept hand comes out
 */
export function afterFreeMulligan(first: HandOutcome): HandOutcome {
    const thrown = 1 - first.keepable;

    return outcome(
        first.distribution.map((entry) => ({
            lands: entry.lands,
            chance: entry.chance * (entry.lands >= KEEP_LOW && entry.lands <= KEEP_HIGH ? 1 + thrown : thrown),
        })),
    );
}

/**
 * How many symbols of each colour a cost asks for
 *
 * Hybrid symbols are left out rather than guessed at: `{W/U}` is satisfied by
 * either colour, so counting it against both would invent a requirement the
 * card does not have.
 *
 * @param manaCost the cost as Scryfall spells it
 *
 * @returns how many of each colour, keyed by the colour
 */
export function colorRequirements(manaCost: string): Map<string, number> {
    const wanted = new Map<string, number>();

    for (const symbol of manaCost.matchAll(/\{([^}]*)\}/g)) {
        const inside = symbol[1]?.toUpperCase() ?? "";
        // Only the plain single-colour symbols. Anything with a slash is a
        // choice, and a choice is not a requirement.
        if (inside.includes("/") || !COLOR_LETTERS.includes(inside)) continue;
        wanted.set(inside, (wanted.get(inside) ?? 0) + 1);
    }

    return wanted;
}
