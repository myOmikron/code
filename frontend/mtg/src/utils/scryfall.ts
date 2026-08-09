/**
 * Resolving printing ids to card data, straight from Scryfall.
 *
 * The collection stores nothing but Scryfall's printing id, so names and images
 * have to come from somewhere. This deliberately does not touch the scanner's
 * card index: that one is built for image matching, is keyed by set and
 * position rather than by id, and downloading shards to render a list would be
 * wildly out of proportion.
 *
 * @see https://scryfall.com/docs/api/cards/collection
 */

/** The subset of a Scryfall card object a collection view needs */
export type Printing = {
    /** Scryfall's id of this printing */
    id: string;
    /** The card's name */
    name: string;
    /** Full set name, e.g. "Modern Masters 2015" */
    setName: string;
    /** Set code, upper case */
    setCode: string;
    /** Collector number within the set */
    collectorNumber: string;
    /** Small artwork for list rows, `null` when Scryfall has no image */
    imageUrl: string | null;
    /** Full-size artwork for the detail view, `null` when Scryfall has no image */
    largeImageUrl: string | null;
    /** Mana cost like `{1}{U}`, empty for lands and the like */
    manaCost: string;
    /** Type line, e.g. "Artifact Creature — Golem" */
    typeLine: string;
    /** Rules text, empty when the card has none */
    oracleText: string;
    /** Rarity as Scryfall spells it: common, uncommon, rare, special, mythic, bonus */
    rarity: string;
    /** The card's page on scryfall.com */
    scryfallUrl: string;
    /** Market price in euro, `null` when unpriced */
    priceEur: number | null;
};

/** Maximum identifiers Scryfall accepts in one `/cards/collection` request */
const BATCH_SIZE = 75;

/** `/cards/collection` and `/cards/search` are rate limited to 2 requests per second */
const REQUEST_INTERVAL_MS = 500;

/** How many search hits to keep — a full page is 175, which nobody scrolls */
const SEARCH_LIMIT = 60;

/**
 * Scryfall's language codes.
 *
 * Needed to read a card url: `/card/{set}/{number}/{slug}` and
 * `/card/{set}/{number}/{lang}/{slug}` are told apart by whether the third
 * segment is one of these, and a slug like `ai` or `fry` would otherwise be
 * mistaken for one.
 */
const LANGS = new Set([
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ja",
    "ko",
    "ru",
    "zhs",
    "zht",
    "he",
    "la",
    "grc",
    "ar",
    "sa",
    "ph",
    "qya",
]);

/** Resolved printings, kept for the lifetime of the tab — printings never change */
const CACHE = new Map<string, Printing>();

/**
 * The card object as Scryfall's API returns it, reduced to what is read here
 */
type ScryfallCard = {
    id: string;
    name: string;
    set_name: string;
    set: string;
    collector_number: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    rarity?: string;
    scryfall_uri?: string;
    image_uris?: { small?: string; normal?: string; large?: string };
    card_faces?: Array<{
        mana_cost?: string;
        type_line?: string;
        oracle_text?: string;
        image_uris?: { small?: string; normal?: string; large?: string };
    }>;
    prices?: { eur: string | null };
};

/**
 * Picks the artwork to show, falling back to the front face of a two-sided card
 *
 * @param card the Scryfall card object
 * @param size which end of the available scans to prefer
 *
 * @returns an image url, or `null` when the card has no scan yet
 */
function imageUrl(card: ScryfallCard, size: "small" | "large"): string | null {
    const order = size === "small" ? (["small", "normal", "large"] as const) : (["normal", "large", "small"] as const);
    const sources = [card.image_uris, card.card_faces?.[0]?.image_uris];
    for (const source of sources) {
        for (const key of order) {
            const found = source?.[key];
            if (found !== undefined) return found;
        }
    }
    return null;
}

/**
 * Waits out the rate limit between two batches
 *
 * @param ms milliseconds to wait
 *
 * @returns a promise resolving after the delay
 */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves printing ids to card data.
 *
 * Ids already known are served from the cache; the rest go out in batches of 75,
 * spaced to stay inside Scryfall's rate limit. Ids Scryfall does not know are
 * simply absent from the result — a printing can be withdrawn by a `delete`
 * migration, and a collection row pointing at one must not break the page.
 *
 * @param ids the printing ids to resolve, duplicates allowed
 *
 * @returns a map from printing id to card data
 */
export async function resolvePrintings(ids: string[]): Promise<Map<string, Printing>> {
    const wanted = [...new Set(ids)];
    const missing = wanted.filter((id) => !CACHE.has(id));

    for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
        if (offset > 0) await delay(REQUEST_INTERVAL_MS);
        const batch = missing.slice(offset, offset + BATCH_SIZE);

        let response: Response;
        try {
            response = await fetch("https://api.scryfall.com/cards/collection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
            });
        } catch (error) {
            // Offline, or Scryfall unreachable. The caller renders what it has.
            console.error("Could not reach Scryfall", error);
            break;
        }
        if (!response.ok) {
            console.error("Scryfall answered", response.status);
            break;
        }

        const body = (await response.json()) as { data?: ScryfallCard[] };
        for (const card of body.data ?? []) toPrinting(card);
    }

    const resolved = new Map<string, Printing>();
    for (const id of wanted) {
        const printing = CACHE.get(id);
        if (printing !== undefined) resolved.set(id, printing);
    }
    return resolved;
}

/**
 * Turns a Scryfall card object into the shape used here, and caches it
 *
 * @param card the raw card object
 *
 * @returns the reduced printing
 */
function toPrinting(card: ScryfallCard): Printing {
    // A two-faced card carries the printed fields per face, not on the card.
    const face = card.card_faces?.[0];
    const printing: Printing = {
        id: card.id,
        name: card.name,
        setName: card.set_name,
        setCode: card.set.toUpperCase(),
        collectorNumber: card.collector_number,
        imageUrl: imageUrl(card, "small"),
        largeImageUrl: imageUrl(card, "large"),
        manaCost: card.mana_cost ?? face?.mana_cost ?? "",
        typeLine: card.type_line ?? face?.type_line ?? "",
        oracleText: card.oracle_text ?? face?.oracle_text ?? "",
        rarity: card.rarity ?? "",
        // `scryfall_uri` carries a utm query when it comes from the api; the
        // bare url is what belongs behind a link the user sees.
        scryfallUrl: (card.scryfall_uri ?? "").split("?")[0] ?? "",
        priceEur: card.prices?.eur !== null && card.prices?.eur !== undefined ? Number(card.prices.eur) : null,
    };
    CACHE.set(printing.id, printing);
    return printing;
}

/**
 * Searches Scryfall for printings to file into a collection.
 *
 * The query is passed through untouched, so the full Scryfall syntax works —
 * `bolt set:2ed`, `t:goblin cmc<=2`, `!"Sol Ring"`. Results are one row per
 * printing rather than per card, because filing a physical card means picking
 * the exact print run it came out of.
 *
 * @param query the Scryfall search query
 * @param signal aborts an in-flight search when the input moves on
 *
 * @returns the matching printings, newest print run first, or an empty array
 */
export async function searchPrintings(query: string, signal?: AbortSignal): Promise<Printing[]> {
    const trimmed = query.trim();
    if (trimmed === "") return [];

    const url = new URL("https://api.scryfall.com/cards/search");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("unique", "prints");
    url.searchParams.set("order", "released");
    url.searchParams.set("dir", "desc");

    let response: Response;
    try {
        response = await fetch(url, { signal });
    } catch (error) {
        if (signal?.aborted === true) return [];
        console.error("Could not reach Scryfall", error);
        return [];
    }

    // Scryfall answers 404 when a valid query simply matches nothing — that is
    // an empty result, not a failure worth reporting.
    if (response.status === 404) return [];
    if (!response.ok) {
        console.error("Scryfall answered", response.status);
        return [];
    }

    const body = (await response.json()) as { data?: ScryfallCard[] };
    return (body.data ?? []).slice(0, SEARCH_LIMIT).map(toPrinting);
}

/** Where a card lives on Scryfall, as spelled in its public url */
export type CardCoordinate = {
    /** The set's three to five letter code */
    setCode: string;
    /** The collector number within that set */
    collectorNumber: string;
    /** The language, when the url names one */
    lang?: string;
};

/**
 * Reads a Scryfall card url.
 *
 * Accepts what a browser puts on the clipboard or in a drag payload when you
 * grab a card link, e.g.
 * `https://scryfall.com/card/hob/1/long-bodied-grey-dog`, with or without the
 * optional language segment.
 *
 * @param url the url to read
 *
 * @returns the coordinate, or `null` when this is not a Scryfall card url
 */
export function parseCardUrl(url: string): CardCoordinate | null {
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
    } catch {
        return null;
    }
    if (!/(^|\.)scryfall\.com$/.test(parsed.hostname)) return null;

    const [card, setCode, collectorNumber, fourth] = parsed.pathname.split("/").filter((part) => part !== "");
    if (card !== "card" || setCode === undefined || collectorNumber === undefined) return null;

    return {
        setCode,
        collectorNumber,
        lang: fourth !== undefined && LANGS.has(fourth) ? fourth : undefined,
    };
}

/**
 * Resolves a card coordinate to a printing.
 *
 * This is how a link dragged in from scryfall.com becomes something the
 * collection can store — the url names set and collector number, the database
 * wants the printing id.
 *
 * @param coordinate where the card lives, see {@link parseCardUrl}
 *
 * @returns the printing, or `null` when Scryfall does not know it
 */
export async function resolveCardUrl(coordinate: CardCoordinate): Promise<Printing | null> {
    const parts = [coordinate.setCode, coordinate.collectorNumber, coordinate.lang]
        .filter((part) => part !== undefined)
        .map((part) => encodeURIComponent(part));

    let response: Response;
    try {
        response = await fetch(`https://api.scryfall.com/cards/${parts.join("/")}`);
    } catch (error) {
        console.error("Could not reach Scryfall", error);
        return null;
    }
    if (!response.ok) return null;

    return toPrinting((await response.json()) as ScryfallCard);
}
