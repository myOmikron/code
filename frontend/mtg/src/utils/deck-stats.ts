/**
 * What a deck is made of, counted in the client.
 *
 * Unlike a collection this is not worth a second request: the card list already
 * arrives with the catalog data behind every slot, a deck is a hundred rows,
 * and counting it here means the numbers move while the deck is being built.
 */

import type { DeckCardResponse } from "src/api/generated";
import { primaryType } from "src/utils/card-types";
import { letters } from "src/utils/deck-rules";

/** Everything above `7` mana is pooled there, as in the collection's curve */
export const MANA_CURVE_CAP = 7;

/** A labelled count */
export type Bucket = {
    /** What is being counted */
    key: string;
    /** How many copies */
    cards: number;
};

/** What the deck's statistics tab draws */
export type DeckStats = {
    /** Copies in the deck, commander included */
    totalCards: number;
    /** Copies that are lands */
    lands: number;
    /** Mean mana value over everything that is not a land */
    averageManaValue: number;
    /** What the deck is worth today, in euro */
    marketValue: number;
    /** Copies the catalog has a price for */
    pricedCards: number;
    /** How many different sets the cards come from */
    distinctSets: number;
    /** Copies per mana value, lands excluded, everything above the cap pooled */
    manaCurve: Array<Bucket>;
    /** Copies whose colour identity contains each colour, keyed `W U B R G` */
    colorIdentity: Array<Bucket>;
    /** Coloured mana symbols across all costs, weighted by copies */
    pips: Array<Bucket>;
    /** Copies that can produce each colour, lands and rocks alike */
    manaSources: Array<Bucket>;
    /** Copies per card type */
    types: Array<Bucket>;
    /** Copies per rarity, keyed by Scryfall's lowercase spelling */
    rarities: Array<Bucket>;
    /** The most expensive cards in the deck */
    topCards: Array<{
        /** The slot it came from */
        uuid: string;
        /** The card's name */
        name: string;
        /** Artwork for a list row */
        imageUrl: string | null;
        /** How many copies */
        copies: number;
        /** What they are worth together, in euro */
        value: number;
    }>;
};

/** How many cards the "most expensive" list holds */
const TOP_LIMIT = 10;

/** The colours, in the order they are written */
const COLOR_LETTERS = ["W", "U", "B", "R", "G"];

/**
 * Count a deck
 *
 * Only the deck proper: the main deck and the command zone. The sideboard and
 * the maybe board are where cards wait, and counting them would make the curve
 * and the mana base describe a deck nobody is playing.
 *
 * @param cards the deck's slots
 * @param colors the colours the deck may play, so the colour charts show those
 *        and no others; every colour when left out
 *
 * @returns the numbers
 */
export function deckStats(cards: Array<DeckCardResponse>, colors?: Array<string>): DeckStats {
    const counted = cards.filter((card) => card.zone === "Main" || card.zone === "Commander");
    // A three colour deck has nothing to say about the two it does not play, so
    // those bars are left out rather than drawn at zero.
    const shown = colors === undefined || colors.length === 0 ? COLOR_LETTERS : colors;

    let totalCards = 0;
    let lands = 0;
    let manaValueSum = 0;
    let nonLands = 0;
    let marketValueCents = 0;
    let pricedCards = 0;

    const sets = new Set<string>();
    const manaCurve = new Map<string, number>();
    const colorIdentity = new Map<string, number>();
    const pips = new Map<string, number>();
    const manaSources = new Map<string, number>();
    const types = new Map<string, number>();
    const rarities = new Map<string, number>();
    const top: DeckStats["topCards"] = [];

    for (const slot of counted) {
        const copies = slot.quantity;
        totalCards += copies;

        const card = slot.card;
        if (card == null) continue;

        sets.add(card.set_code);

        const type = primaryType(card.type_line);
        add(types, type, copies);

        if (type === "land") {
            lands += copies;
        } else {
            nonLands += copies;
            manaValueSum += card.mana_value * copies;
            const bucket = Math.min(Math.round(card.mana_value), MANA_CURVE_CAP);
            add(manaCurve, String(bucket), copies);
        }

        for (const color of letters(card.color_identity)) add(colorIdentity, color, copies);
        // Every copy counts: eight Islands are eight blue sources. What makes
        // the mana is Scryfall's `produced_mana`, so a rock and a dork count
        // exactly like a land does.
        for (const color of card.produced_mana) {
            if (COLOR_LETTERS.includes(color)) add(manaSources, color, copies);
        }
        countPips(card.mana_cost).forEach((count, index) => {
            if (count > 0) add(pips, COLOR_LETTERS[index] ?? "", count * copies);
        });

        add(rarities, String(card.rarity).toLowerCase(), copies);

        const price = card.price_eur_cents;
        if (price != null) {
            marketValueCents += price * copies;
            pricedCards += copies;
            top.push({
                uuid: slot.uuid,
                name: card.name,
                imageUrl: card.image_small ?? null,
                copies,
                value: (price * copies) / 100,
            });
        }
    }

    top.sort((left, right) => right.value - left.value);

    return {
        totalCards,
        lands,
        averageManaValue: nonLands === 0 ? 0 : manaValueSum / nonLands,
        marketValue: marketValueCents / 100,
        pricedCards,
        distinctSets: sets.size,
        // Trimmed to the highest bucket that holds anything: a deck that tops
        // out at four has nothing to say with three empty bars after it.
        manaCurve: fixed(manaCurve, curveBuckets(manaCurve)),
        colorIdentity: fixed(colorIdentity, shown),
        pips: fixed(pips, shown),
        manaSources: fixed(manaSources, shown),
        types: sorted(types),
        rarities: sorted(rarities),
        topCards: top.slice(0, TOP_LIMIT),
    };
}

/**
 * Count the coloured mana symbols in a cost
 *
 * Hybrid symbols count for every colour in them, which is what makes a deck's
 * colour requirements readable: `{W/U}` asks for either, so it is a pip of both.
 *
 * @param manaCost the cost as Scryfall spells it
 *
 * @returns the counts in `WUBRG` order
 */
export function countPips(manaCost: string): Array<number> {
    const counts = [0, 0, 0, 0, 0];
    for (const symbol of manaCost.matchAll(/\{([^}]*)\}/g)) {
        const inside = symbol[1]?.toUpperCase() ?? "";
        COLOR_LETTERS.forEach((color, index) => {
            if (inside.includes(color)) counts[index] = (counts[index] ?? 0) + 1;
        });
    }
    return counts;
}

/**
 * Add copies to a bucket
 *
 * @param map the buckets
 * @param key which one
 * @param copies how many to add
 */
function add(map: Map<string, number>, key: string, copies: number) {
    if (key === "") return;
    map.set(key, (map.get(key) ?? 0) + copies);
}

/**
 * The buckets in a fixed order, zero-filled
 *
 * @param map the buckets
 * @param keys the order
 *
 * @returns one entry per key
 */
function fixed(map: Map<string, number>, keys: Array<string>): Array<Bucket> {
    return keys.map((key) => ({ key, cards: map.get(key) ?? 0 }));
}

/**
 * The buckets, fullest first
 *
 * @param map the buckets
 *
 * @returns the entries
 */
function sorted(map: Map<string, number>): Array<Bucket> {
    return Array.from(map, ([key, cards]) => ({ key, cards })).sort((left, right) => right.cards - left.cards);
}

/**
 * The mana values worth drawing a bar for
 *
 * @param curve what was counted
 *
 * @returns the buckets from zero up to the highest one in use
 */
function curveBuckets(curve: Map<string, number>): Array<string> {
    const highest = Math.max(0, ...Array.from(curve, ([key, cards]) => (cards > 0 ? Number(key) : 0)));
    return Array.from({ length: highest + 1 }, (_, value) => String(value));
}
