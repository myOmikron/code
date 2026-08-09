/**
 * Everything the statistics tab shows, derived from what a collection already
 * loaded — the entries and the Scryfall data behind their printings.
 *
 * Kept out of the route on purpose: this is where every judgement call about
 * what a number means lives (which cards count, what a foil is worth, how a
 * card with two types is filed), and those are the parts worth testing.
 *
 * Everything is weighted by copies. A playset of four counts four times, which
 * is the only reading that makes a mana curve or a colour split describe the
 * cardboard actually sitting in the box.
 */

import type { CollectionEntryResponse } from "src/api/generated";
import type { Printing } from "src/utils/scryfall";

/** The mana values shown separately before everything above is pooled */
export const MANA_CURVE_CAP = 7;

/** Magic's five colours, in the canonical WUBRG order */
export const COLOR_LETTERS = ["W", "U", "B", "R", "G"] as const;

/** The formats the legality chart asks about */
export const TRACKED_FORMATS = ["standard", "pioneer", "modern", "legacy", "vintage", "commander", "pauper"] as const;

/**
 * Card types, most specific first.
 *
 * A card gets exactly one bucket — a "Legendary Artifact Creature" is a
 * creature to anyone sorting a box. Lands come first regardless, because an
 * artifact land is part of a mana base, not of an artifact theme.
 */
const TYPE_ORDER = ["Land", "Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Enchantment", "Artifact"];

/**
 * Price brackets in euro, upper bound exclusive.
 *
 * Logarithmic rather than linear: a collection's value distribution is a long
 * tail, and linear buckets would put everything in the first one.
 */
const VALUE_BUCKETS: Array<{ key: string; max: number }> = [
    { key: "bulk", max: 0.25 },
    { key: "low", max: 1 },
    { key: "mid", max: 5 },
    { key: "high", max: 20 },
    { key: "premium", max: 100 },
    { key: "chase", max: Number.POSITIVE_INFINITY },
];

/** How many rows the "top N" charts show */
const TOP_LIMIT = 10;

/** A labelled count of copies */
export type Bucket = {
    /** Identifies the bucket — a translation slug for known sets, raw data otherwise */
    key: string;
    /** Copies in it */
    cards: number;
};

/** One point of the acquisition timeline */
export type TimelinePoint = {
    /** The month as `YYYY-MM` */
    month: string;
    /** Copies owned by the end of that month */
    cards: number;
    /** What those copies are worth today */
    value: number;
};

/** One stack in the market-versus-purchase comparison */
export type PricePoint = {
    /** The card's name */
    name: string;
    /** What was paid per copy */
    purchase: number;
    /** What one copy fetches today */
    market: number;
    /** How many copies the stack holds */
    copies: number;
};

/** A card worth calling out */
export type CardHighlight = {
    /** The entry it came from */
    uuid: string;
    /** The card */
    printing: Printing;
    /** Copies in the stack */
    copies: number;
    /** What the whole stack is worth */
    value: number;
};

/** The numbers behind the statistics tab */
export type CollectionStats = {
    /** Copies filed in total */
    totalCards: number;
    /** Rows in the collection — a stack is one printing in one condition and finish */
    stacks: number;
    /** How many different sets are represented */
    distinctSets: number;
    /** What the whole collection fetches today */
    marketValue: number;
    /** Copies Scryfall has a price for */
    pricedCards: number;
    /** What was paid, over the stacks that recorded it */
    purchaseTotal: number;
    /** Copies with a recorded purchase price */
    purchasedCards: number;
    /** Today's value of exactly those copies */
    marketOfPurchased: number;
    /** Mean value of a priced copy */
    averageValue: number;
    /** Copies on the reserved list */
    reservedCards: number;
    /** What those are worth */
    reservedValue: number;
    /** Copies per mana value, lands excluded, everything above the cap pooled */
    manaCurve: Bucket[];
    /** Copies whose colour identity contains each colour */
    colorIdentity: Bucket[];
    /** Coloured mana symbols across all costs, weighted by copies */
    pips: Bucket[];
    /** Copies per colour count — mono, two-colour, and so on */
    colorSpread: Bucket[];
    /** Copies per card type */
    types: Bucket[];
    /** Copies per rarity */
    rarities: Bucket[];
    /** Copies per price bracket */
    valueBuckets: Bucket[];
    /** Cumulative copies and value over time */
    timeline: TimelinePoint[];
    /** Copies per release year of the printing */
    years: Bucket[];
    /** The most represented illustrators */
    artists: Bucket[];
    /** Copies legal in each tracked format */
    formats: Bucket[];
    /** The most common rules keywords */
    keywords: Bucket[];
    /** Sets by copies, most first */
    sets: Array<Bucket & { setName: string; value: number }>;
    /** The most valuable stacks */
    topCards: CardHighlight[];
    /** Paid against worth, per stack that recorded a purchase price */
    pricePoints: PricePoint[];
    /** The oldest printing in the collection, `null` when nothing resolved */
    oldest: Printing | null;
};

/**
 * What one copy of a stack is worth today.
 *
 * A foil is a different card on the market than its non-foil twin, and a
 * collection that is half foils would be badly misvalued by the non-foil price.
 * Etched printings fall back to the non-foil price — Scryfall prices them
 * separately, but the field is absent often enough that the fallback is the
 * honest default.
 *
 * @param entry the stack
 * @param printing the card, if Scryfall knows it
 *
 * @returns the price per copy, or `null` when there is none
 */
export function priceOf(entry: CollectionEntryResponse, printing: Printing | undefined): number | null {
    if (printing === undefined) return null;
    if (entry.finish === "Foil" && printing.priceEurFoil !== null) return printing.priceEurFoil;
    return printing.priceEur;
}

/**
 * The single type a card is filed under.
 *
 * Only the front half of a two-faced card is read: the back is the same piece
 * of cardboard, and counting both would inflate the totals.
 *
 * @param typeLine the type line as Scryfall spells it
 *
 * @returns one of {@link TYPE_ORDER}, or `other` for tokens, schemes and the like
 */
export function primaryType(typeLine: string): string {
    // Everything after the em dash is the subtype — "Creature — Goblin Rogue"
    // must not be read as a card called Rogue.
    const front = (typeLine.split("//")[0] ?? "").split("—")[0] ?? "";
    for (const type of TYPE_ORDER) {
        if (front.includes(type)) return type.toLowerCase();
    }
    return "other";
}

/**
 * Counts the coloured mana symbols in a card's cost.
 *
 * Hybrid and phyrexian symbols count for every colour they can be paid with:
 * `{W/U}` is a white pip and a blue pip, because that is exactly what makes the
 * card castable in either deck. Split cards and adventures contribute both
 * halves, transforming cards only their front — the back has no cost you pay.
 *
 * @param printing the card
 *
 * @returns pips per colour letter
 */
export function countPips(printing: Printing): Record<string, number> {
    const counts: Record<string, number> = {};
    // Split cards and adventures carry a cost per face and nothing on the card
    // itself; ordinary cards carry it the other way round.
    const costs = printing.faces.length > 0 ? printing.faces.map((face) => face.manaCost) : [printing.manaCost];

    for (const cost of costs) {
        for (const symbol of cost.match(/\{[^}]+\}/g) ?? []) {
            for (const letter of COLOR_LETTERS) {
                if (symbol.includes(letter)) counts[letter] = (counts[letter] ?? 0) + 1;
            }
        }
    }
    return counts;
}

/**
 * Sorts buckets by copies and keeps the busiest ones
 *
 * @param counts copies per key
 * @param limit how many to keep
 *
 * @returns the top buckets, most copies first
 */
function topBuckets(counts: Map<string, number>, limit: number): Bucket[] {
    return [...counts.entries()]
        .sort(([leftKey, left], [rightKey, right]) => right - left || leftKey.localeCompare(rightKey))
        .slice(0, limit)
        .map(([key, cards]) => ({ key, cards }));
}

/**
 * Turns a collection into every number the statistics tab draws.
 *
 * Stacks whose printing Scryfall no longer knows still count towards the card
 * total — they are cards in a box — but they contribute to no chart that needs
 * card data, rather than silently landing in an "unknown" bucket that would
 * read as a real category.
 *
 * @param entries the collection's stacks
 * @param printings the resolved card data, keyed by printing id
 *
 * @returns the statistics
 */
export function computeCollectionStats(
    entries: CollectionEntryResponse[],
    printings: Map<string, Printing>,
): CollectionStats {
    let totalCards = 0;
    let marketValue = 0;
    let pricedCards = 0;
    let purchaseTotal = 0;
    let purchasedCards = 0;
    let marketOfPurchased = 0;
    let reservedCards = 0;
    let reservedValue = 0;

    const manaCurve = new Map<string, number>();
    const colorIdentity = new Map<string, number>();
    const pips = new Map<string, number>();
    const colorSpread = new Map<string, number>();
    const types = new Map<string, number>();
    const rarities = new Map<string, number>();
    const valueBuckets = new Map<string, number>();
    const years = new Map<string, number>();
    const artists = new Map<string, number>();
    const formats = new Map<string, number>();
    const keywords = new Map<string, number>();
    const setCards = new Map<string, number>();
    const setValue = new Map<string, number>();
    const setNames = new Map<string, string>();
    const perMonth = new Map<string, { cards: number; value: number }>();

    const highlights: CardHighlight[] = [];
    const pricePoints: PricePoint[] = [];
    let oldest: Printing | null = null;

    /**
     * Adds copies to a bucket
     *
     * @param counts the map to add to
     * @param key the bucket
     * @param copies how many copies
     */
    function add(counts: Map<string, number>, key: string, copies: number) {
        counts.set(key, (counts.get(key) ?? 0) + copies);
    }

    for (const entry of entries) {
        const copies = entry.quantity;
        totalCards += copies;

        const printing = printings.get(entry.printing);
        const price = priceOf(entry, printing);
        const stackValue = price !== null ? price * copies : 0;

        if (price !== null) {
            marketValue += stackValue;
            pricedCards += copies;
            add(valueBuckets, VALUE_BUCKETS.find((bucket) => price < bucket.max)?.key ?? "chase", copies);
        }

        if (entry.purchase_price_cents !== undefined && entry.purchase_price_cents !== null) {
            const paid = entry.purchase_price_cents / 100;
            purchaseTotal += paid * copies;
            purchasedCards += copies;
            marketOfPurchased += stackValue;
            if (price !== null && printing !== undefined) {
                pricePoints.push({ name: printing.name, purchase: paid, market: price, copies });
            }
        }

        // The day the cards were acquired is the honest x-axis; when nobody
        // recorded one, the day the stack was filed is the best stand-in.
        const acquired = entry.acquired_at ?? entry.created_at;
        const month = acquired.slice(0, 7);
        const point = perMonth.get(month) ?? { cards: 0, value: 0 };
        perMonth.set(month, { cards: point.cards + copies, value: point.value + stackValue });

        if (printing === undefined) continue;

        if (printing.reserved) {
            reservedCards += copies;
            reservedValue += stackValue;
        }

        const type = primaryType(printing.typeLine);
        add(types, type, copies);
        // A land's mana value is zero and would tower over the curve without
        // saying anything about what the deck casts.
        if (type !== "land") {
            add(manaCurve, String(Math.min(Math.round(printing.manaValue), MANA_CURVE_CAP)), copies);
        }

        for (const letter of printing.colorIdentity) add(colorIdentity, letter, copies);
        add(colorSpread, String(printing.colorIdentity.length), copies);
        for (const [letter, count] of Object.entries(countPips(printing))) add(pips, letter, count * copies);

        if (printing.rarity !== "") add(rarities, printing.rarity, copies);
        if (printing.artist !== "") add(artists, printing.artist, copies);
        if (printing.releasedAt !== "") add(years, printing.releasedAt.slice(0, 4), copies);
        for (const keyword of printing.keywords) add(keywords, keyword, copies);
        for (const format of TRACKED_FORMATS) {
            if (printing.legalities[format] === "legal") add(formats, format, copies);
        }

        add(setCards, printing.setCode, copies);
        setValue.set(printing.setCode, (setValue.get(printing.setCode) ?? 0) + stackValue);
        setNames.set(printing.setCode, printing.setName);

        if (printing.releasedAt !== "" && (oldest === null || printing.releasedAt < oldest.releasedAt)) {
            oldest = printing;
        }
        if (price !== null) {
            highlights.push({ uuid: entry.uuid, printing, copies, value: stackValue });
        }
    }

    // Cumulative, so the line only ever climbs: the chart answers "what did I
    // own back then", not "what did I buy that month".
    const timeline: TimelinePoint[] = [];
    let runningCards = 0;
    let runningValue = 0;
    for (const month of [...perMonth.keys()].sort()) {
        const point = perMonth.get(month) ?? { cards: 0, value: 0 };
        runningCards += point.cards;
        runningValue += point.value;
        timeline.push({ month, cards: runningCards, value: runningValue });
    }

    return {
        totalCards,
        stacks: entries.length,
        distinctSets: setCards.size,
        marketValue,
        pricedCards,
        purchaseTotal,
        purchasedCards,
        marketOfPurchased,
        averageValue: pricedCards === 0 ? 0 : marketValue / pricedCards,
        reservedCards,
        reservedValue,
        manaCurve: Array.from({ length: MANA_CURVE_CAP + 1 }, (_, manaValue) => ({
            key: String(manaValue),
            cards: manaCurve.get(String(manaValue)) ?? 0,
        })),
        colorIdentity: COLOR_LETTERS.map((letter) => ({ key: letter, cards: colorIdentity.get(letter) ?? 0 })),
        pips: COLOR_LETTERS.map((letter) => ({ key: letter, cards: pips.get(letter) ?? 0 })),
        colorSpread: ["0", "1", "2", "3", "4", "5"].map((count) => ({
            key: count,
            cards: colorSpread.get(count) ?? 0,
        })),
        types: TYPE_ORDER.map((type) => ({
            key: type.toLowerCase(),
            cards: types.get(type.toLowerCase()) ?? 0,
        })).concat({ key: "other", cards: types.get("other") ?? 0 }),
        rarities: topBuckets(rarities, TOP_LIMIT),
        valueBuckets: VALUE_BUCKETS.map((bucket) => ({ key: bucket.key, cards: valueBuckets.get(bucket.key) ?? 0 })),
        timeline,
        years: [...years.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, cards]) => ({ key, cards })),
        artists: topBuckets(artists, TOP_LIMIT),
        formats: TRACKED_FORMATS.map((format) => ({ key: format, cards: formats.get(format) ?? 0 })),
        keywords: topBuckets(keywords, TOP_LIMIT),
        sets: topBuckets(setCards, TOP_LIMIT).map((bucket) => ({
            ...bucket,
            setName: setNames.get(bucket.key) ?? bucket.key,
            value: setValue.get(bucket.key) ?? 0,
        })),
        topCards: highlights.sort((left, right) => right.value - left.value).slice(0, 5),
        pricePoints,
        oldest,
    };
}
