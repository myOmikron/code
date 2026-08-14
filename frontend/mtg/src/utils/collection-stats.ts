/**
 * The statistics tab's data, as the charts consume it.
 *
 * The counting happens server-side — one request answers with every number the
 * tab draws, instead of the client fetching every entry and asking Scryfall
 * about each printing. What remains here is the shape the components read and
 * the one conversion the backend deliberately does not do: money arrives as
 * euro cents and is turned into euros exactly once, at this boundary.
 */

import type { CollectionStatisticsResponse } from "src/api/generated";

/** The mana values shown separately before everything above is pooled */
export const MANA_CURVE_CAP = 7;

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
    /** The card's name */
    name: string;
    /** Full set name */
    setName: string;
    /** Artwork for a list row, `null` when the catalog has no image */
    imageUrl: string | null;
    /** Copies in the stack */
    copies: number;
    /** What the whole stack is worth */
    value: number;
};

/** The oldest printing in the collection */
export type OldestPrinting = {
    /** The card's name */
    name: string;
    /** Full set name */
    setName: string;
    /** The day it was released, as `YYYY-MM-DD` */
    releasedAt: string;
};

/** The numbers behind the statistics tab */
export type CollectionStats = {
    /** Copies filed in total */
    totalCards: number;
    /** How many different sets are represented */
    distinctSets: number;
    /** What the whole collection fetches today */
    marketValue: number;
    /** Copies the catalog has a price for */
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
    /** Copies per condition, best grade first */
    conditions: Bucket[];
    /** Copies per finish */
    finishes: Bucket[];
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
    /** Paid against worth, for the stacks with the most money riding on them */
    pricePoints: PricePoint[];
    /** The oldest printing in the collection, `null` when nothing resolved */
    oldest: OldestPrinting | null;
};

/**
 * Turns euro cents into euros.
 *
 * The backend keeps money in cents so its sums stay exact integers; the charts
 * and formatters here work in euros. Dividing by a hundred is lossless in
 * floating point for anything a card collection is worth.
 *
 * @param cents the amount in euro cents
 *
 * @returns the amount in euros
 */
function euros(cents: number): number {
    return cents / 100;
}

/**
 * Reads the backend's statistics into the shape the charts consume
 *
 * @param response what the statistics endpoint answered
 *
 * @returns the statistics, with all money converted to euros
 */
export function statsFromResponse(response: CollectionStatisticsResponse): CollectionStats {
    return {
        totalCards: response.total_cards,
        distinctSets: response.distinct_sets,
        marketValue: euros(response.market_value_cents),
        pricedCards: response.priced_cards,
        purchaseTotal: euros(response.purchase_total_cents),
        purchasedCards: response.purchased_cards,
        marketOfPurchased: euros(response.market_of_purchased_cents),
        averageValue: euros(response.average_value_cents),
        reservedCards: response.reserved_cards,
        reservedValue: euros(response.reserved_value_cents),
        manaCurve: response.mana_curve,
        colorIdentity: response.color_identity,
        pips: response.pips,
        colorSpread: response.color_spread,
        types: response.types,
        rarities: response.rarities,
        valueBuckets: response.value_buckets,
        conditions: response.conditions,
        finishes: response.finishes,
        timeline: response.timeline.map((point) => ({
            month: point.month,
            cards: point.cards,
            value: euros(point.value_cents),
        })),
        years: response.years,
        artists: response.artists,
        formats: response.formats,
        keywords: response.keywords,
        sets: response.sets.map((set) => ({
            key: set.set_code,
            setName: set.set_name,
            cards: set.cards,
            value: euros(set.value_cents),
        })),
        topCards: response.top_cards.map((card) => ({
            uuid: card.uuid,
            name: card.name,
            setName: card.set_name,
            imageUrl: card.image_small ?? null,
            copies: card.copies,
            value: euros(card.value_cents),
        })),
        pricePoints: response.price_points.map((point) => ({
            name: point.name,
            purchase: euros(point.purchase_cents),
            market: euros(point.market_cents),
            copies: point.copies,
        })),
        oldest:
            response.oldest !== undefined && response.oldest !== null
                ? {
                      name: response.oldest.name,
                      setName: response.oldest.set_name,
                      releasedAt: response.oldest.released_at,
                  }
                : null,
    };
}
