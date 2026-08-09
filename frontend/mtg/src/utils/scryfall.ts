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
    /** Market price in euro, `null` when unpriced */
    priceEur: number | null;
};

/** Maximum identifiers Scryfall accepts in one `/cards/collection` request */
const BATCH_SIZE = 75;

/** `/cards/collection` is rate limited to 2 requests per second */
const REQUEST_INTERVAL_MS = 500;

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
    image_uris?: { small?: string; normal?: string };
    card_faces?: Array<{ image_uris?: { small?: string; normal?: string } }>;
    prices?: { eur: string | null };
};

/**
 * Picks the artwork to show, falling back to the front face of a two-sided card
 *
 * @param card the Scryfall card object
 *
 * @returns an image url, or `null` when the card has no scan yet
 */
function imageUrl(card: ScryfallCard): string | null {
    const direct = card.image_uris?.small ?? card.image_uris?.normal;
    if (direct !== undefined) return direct;
    const face = card.card_faces?.[0]?.image_uris;
    return face?.small ?? face?.normal ?? null;
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
        for (const card of body.data ?? []) {
            CACHE.set(card.id, {
                id: card.id,
                name: card.name,
                setName: card.set_name,
                setCode: card.set.toUpperCase(),
                collectorNumber: card.collector_number,
                imageUrl: imageUrl(card),
                priceEur: card.prices?.eur !== null && card.prices?.eur !== undefined ? Number(card.prices.eur) : null,
            });
        }
    }

    const resolved = new Map<string, Printing>();
    for (const id of wanted) {
        const printing = CACHE.get(id);
        if (printing !== undefined) resolved.set(id, printing);
    }
    return resolved;
}
