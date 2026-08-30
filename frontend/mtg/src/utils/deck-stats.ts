/**
 * What a deck is made of, counted in the client.
 *
 * Unlike a collection this is not worth a second request: the card list already
 * arrives with the catalog data behind every slot, a deck is a hundred rows,
 * and counting it here means the numbers move while the deck is being built.
 */

import type { DeckCardResponse, DeckTagResponse } from "src/api/generated";
import { primaryType, TYPE_GROUP_ORDER } from "src/utils/card-types";
import { effectiveManaValue } from "src/utils/commander";
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

/** What a chart can be broken up by */
export type DeckSplit = "all" | "colors" | "types" | "tags";

/** The splits in the order they are offered */
export const DECK_SPLITS: Array<DeckSplit> = ["all", "colors", "types", "tags"];

/** The single segment everything falls into when nothing is split */
export const WHOLE_DECK = "all";

/** The key the cards without a tag are counted under */
export const UNTAGGED = "untagged";

/** One bar, made of the segments it is stacked from */
export type StackedBucket = {
    /** What the bar stands for: a mana value, a colour */
    key: string;
    /** The parts it is made of, in the split's order */
    segments: Array<Bucket>;
};

/** A chart broken up by every split, with the segments each one uses */
export type SplitChart = {
    /** The bars per split */
    bars: Record<DeckSplit, Array<StackedBucket>>;
    /** Which segments a split is stacked from, in the order they are drawn */
    segments: Record<DeckSplit, Array<string>>;
};

/** What one tag holds */
export type TagStats = {
    /** The tag's id, or {@link UNTAGGED} */
    key: string;
    /** Copies carrying it */
    cards: number;
    /** How many of those are lands */
    lands: number;
    /** Mean mana value over the ones that are not */
    averageManaValue: number;
    /** What they are worth together, in euro */
    value: number;
    /** Coloured mana symbols across their costs, keyed `W U B R G` */
    pips: Array<Bucket>;
    /** Copies per card type */
    types: Array<Bucket>;
};

/** What the deck's statistics tab draws */
export type DeckStats = {
    /** Copies in the deck, commander included */
    totalCards: number;
    /** Copies that are lands */
    lands: number;
    /** Mean mana value as cast over everything that is not a land */
    averageManaValue: number;
    /** Whether an eminence discount shaped the curve and the averages */
    eminence: boolean;
    /** What the deck is worth today, in euro */
    marketValue: number;
    /** Copies the catalog has a price for */
    pricedCards: number;
    /** How many different sets the cards come from */
    distinctSets: number;
    /** Copies per mana value as cast, lands excluded, everything above the cap pooled */
    manaCurve: Array<Bucket>;
    /** The same curve, broken up by each split */
    manaCurveSplit: SplitChart;
    /** Copies whose colour identity contains each colour, keyed `W U B R G` */
    colorIdentity: Array<Bucket>;
    /** Coloured mana symbols across all costs, weighted by copies */
    pips: Array<Bucket>;
    /** The same symbols, broken up by each split */
    pipsSplit: SplitChart;
    /** Copies that can produce each colour, lands and rocks alike */
    manaSources: Array<Bucket>;
    /** Copies per card type */
    types: Array<Bucket>;
    /** Copies per rarity, keyed by Scryfall's lowercase spelling */
    rarities: Array<Bucket>;
    /** What each tag holds, in the order the tags are listed, untagged last */
    tagStats: Array<TagStats>;
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

/** The colour buckets a card falls into, in the order they are drawn */
const COLOR_BUCKETS = [...COLOR_LETTERS, "multicolor", "colorless"];

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
 * @param tags the tags that exist, which fixes the order the tag splits are
 *        drawn in; the splits stay empty without them
 *
 * @returns the numbers
 */
export function deckStats(
    cards: Array<DeckCardResponse>,
    colors?: Array<string>,
    tags: Array<DeckTagResponse> = [],
): DeckStats {
    const counted = cards.filter((card) => card.zone === "Main" || card.zone === "Commander");
    const casting = effectiveManaValue(counted);
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
    const curveSplit = emptySplit();
    const pipSplit = emptySplit();
    const perTag = new Map<string, TagTally>();
    const top: DeckStats["topCards"] = [];

    for (const slot of counted) {
        const copies = slot.quantity;
        totalCards += copies;

        const card = slot.card;
        if (card == null) continue;

        sets.add(card.set_code);

        const type = primaryType(card.type_line);
        add(types, type, copies);

        const identity = letters(card.color_identity);
        const parts: Record<DeckSplit, Array<string>> = {
            all: [WHOLE_DECK],
            colors: [colorBucket(identity)],
            types: [type],
            tags: slot.tags.length === 0 ? [UNTAGGED] : slot.tags,
        };

        const isLand = type === "land";
        const manaValue = casting.of(card);
        if (isLand) {
            lands += copies;
        } else {
            nonLands += copies;
            manaValueSum += manaValue * copies;
            const bucket = String(Math.min(Math.round(manaValue), MANA_CURVE_CAP));
            add(manaCurve, bucket, copies);
            stack(curveSplit, parts, bucket, copies);
        }

        for (const color of identity) add(colorIdentity, color, copies);
        // Every copy counts: eight Islands are eight blue sources. What makes
        // the mana is Scryfall's `produced_mana`, so a rock and a dork count
        // exactly like a land does.
        for (const color of card.produced_mana) {
            if (COLOR_LETTERS.includes(color)) add(manaSources, color, copies);
        }
        const cost = countPips(card.mana_cost);
        cost.forEach((count, index) => {
            const color = COLOR_LETTERS[index] ?? "";
            if (count === 0 || color === "") return;
            add(pips, color, count * copies);
            stack(pipSplit, parts, color, count * copies);
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

        for (const key of parts.tags) {
            const tally = tallyOf(perTag, key);
            tally.cards += copies;
            tally.valueCents += (price ?? 0) * copies;
            add(tally.types, type, copies);
            if (isLand) {
                tally.lands += copies;
            } else {
                tally.nonLands += copies;
                tally.manaValueSum += manaValue * copies;
            }
            cost.forEach((count, index) => {
                if (count > 0) add(tally.pips, COLOR_LETTERS[index] ?? "", count * copies);
            });
        }
    }

    top.sort((left, right) => right.value - left.value);

    // Trimmed to the highest bucket that holds anything: a deck that tops out
    // at four has nothing to say with three empty bars after it.
    const curveKeys = curveBuckets(manaCurve);
    const tagOrder = [...tags.map((tag) => tag.uuid), UNTAGGED];

    return {
        totalCards,
        lands,
        averageManaValue: nonLands === 0 ? 0 : manaValueSum / nonLands,
        eminence: casting.eminence,
        marketValue: marketValueCents / 100,
        pricedCards,
        distinctSets: sets.size,
        manaCurve: fixed(manaCurve, curveKeys),
        manaCurveSplit: chartOf(curveSplit, curveKeys, tagOrder),
        colorIdentity: fixed(colorIdentity, shown),
        pips: fixed(pips, shown),
        pipsSplit: chartOf(pipSplit, shown, tagOrder),
        manaSources: fixed(manaSources, shown),
        types: sorted(types),
        rarities: sorted(rarities),
        tagStats: tagOrder
            .filter((key) => perTag.has(key))
            .map((key) => statsOfTally(key, perTag.get(key) as TagTally, shown)),
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

/** What is counted per tag while walking the deck */
type TagTally = {
    /** Copies carrying the tag */
    cards: number;
    /** How many of those are lands */
    lands: number;
    /** How many are not */
    nonLands: number;
    /** Their mana values added up */
    manaValueSum: number;
    /** What they are worth, in cents */
    valueCents: number;
    /** Coloured symbols in their costs */
    pips: Map<string, number>;
    /** Copies per card type */
    types: Map<string, number>;
};

/** A bar's segments, per split: split → bar → segment → copies */
type SplitTally = Record<DeckSplit, Map<string, Map<string, number>>>;

/**
 * An empty tally for every split
 *
 * @returns the tally
 */
function emptySplit(): SplitTally {
    return { all: new Map(), colors: new Map(), types: new Map(), tags: new Map() };
}

/**
 * Which colour bucket a card falls into
 *
 * Spelled the way the card list groups by colour, so a deck read as five piles
 * and a deck read as five stacked bars agree on what a gold card is.
 *
 * @param identity the card's colour identity, letter by letter
 *
 * @returns the bucket
 */
function colorBucket(identity: Array<string>): string {
    if (identity.length === 0) return "colorless";
    if (identity.length > 1) return "multicolor";
    return identity[0] ?? "colorless";
}

/**
 * Add copies to one bar of every split
 *
 * @param tally what is being stacked
 * @param parts which segment the card belongs to, per split
 * @param bar the bar it lands on
 * @param copies how many to add
 */
function stack(tally: SplitTally, parts: Record<DeckSplit, Array<string>>, bar: string, copies: number) {
    for (const split of DECK_SPLITS) {
        let bars = tally[split].get(bar);
        if (bars === undefined) {
            bars = new Map();
            tally[split].set(bar, bars);
        }
        for (const segment of parts[split]) bars.set(segment, (bars.get(segment) ?? 0) + copies);
    }
}

/**
 * The tally as bars, in the order they are drawn
 *
 * @param tally what was stacked
 * @param bars the bars, in order
 * @param tagOrder the tag ids in the order the deck lists them, untagged last
 *
 * @returns the chart
 */
function chartOf(tally: SplitTally, bars: Array<string>, tagOrder: Array<string>): SplitChart {
    const segments: Record<DeckSplit, Array<string>> = {
        all: [WHOLE_DECK],
        colors: used(tally.colors, COLOR_BUCKETS, true),
        types: used(tally.types, TYPE_GROUP_ORDER, true),
        tags: used(tally.tags, tagOrder, false),
    };

    const drawn = {} as Record<DeckSplit, Array<StackedBucket>>;
    for (const split of DECK_SPLITS) {
        drawn[split] = bars.map((bar) => {
            const counts = tally[split].get(bar);
            return {
                key: bar,
                segments: segments[split].map((segment) => ({ key: segment, cards: counts?.get(segment) ?? 0 })),
            };
        });
    }

    return { bars: drawn, segments };
}

/**
 * The segments a split actually uses, in the order they belong in
 *
 * @param tally the split's bars
 * @param order where a segment sits
 * @param keepUnknown whether a segment the order does not know follows the ones
 *        it does; the tag split drops them, because a tag the deck was not
 *        handed has no name and no colour to be drawn with
 *
 * @returns the segments in use
 */
function used(tally: Map<string, Map<string, number>>, order: Array<string>, keepUnknown: boolean): Array<string> {
    const seen = new Set<string>();
    for (const bar of tally.values()) {
        for (const [segment, cards] of bar) if (cards > 0) seen.add(segment);
    }
    const known = order.filter((segment) => seen.has(segment));
    if (!keepUnknown) return known;

    const rest = Array.from(seen).filter((segment) => !order.includes(segment));
    return [...known, ...rest.sort()];
}

/**
 * The tally of a tag, creating it on first sight
 *
 * @param tallies what has been counted so far
 * @param key the tag
 *
 * @returns its tally
 */
function tallyOf(tallies: Map<string, TagTally>, key: string): TagTally {
    const known = tallies.get(key);
    if (known !== undefined) return known;

    const fresh: TagTally = {
        cards: 0,
        lands: 0,
        nonLands: 0,
        manaValueSum: 0,
        valueCents: 0,
        pips: new Map(),
        types: new Map(),
    };
    tallies.set(key, fresh);
    return fresh;
}

/**
 * A tag's tally, ready to be drawn
 *
 * @param key the tag
 * @param tally what was counted
 * @param colors the colours the deck plays
 *
 * @returns the tag's numbers
 */
function statsOfTally(key: string, tally: TagTally, colors: Array<string>): TagStats {
    return {
        key,
        cards: tally.cards,
        lands: tally.lands,
        averageManaValue: tally.nonLands === 0 ? 0 : tally.manaValueSum / tally.nonLands,
        value: tally.valueCents / 100,
        pips: fixed(tally.pips, colors),
        types: sorted(tally.types),
    };
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
