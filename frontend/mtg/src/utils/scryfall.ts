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

import { readPrintings, writePrintings } from "src/utils/printing-store";

/**
 * What a printing is assumed to have been produced in when nothing says
 * otherwise.
 *
 * Claiming no finishes at all would leave the edit form with nothing to offer;
 * every card exists as a plain one.
 */
export const DEFAULT_FINISHES = ["nonfoil"];

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
    /**
     * Colour identity as the letters `W`, `U`, `B`, `R`, `G`, empty for colourless.
     *
     * Identity, not cost: it counts the pips in the rules text too, which is
     * what decides whether a card may go into a commander deck.
     */
    colorIdentity: string[];
    /** Mana value (formerly converted mana cost) */
    manaValue: number;
    /** The day this printing was released, as `YYYY-MM-DD` */
    releasedAt: string;
    /** Illustrator, empty when Scryfall has none on file */
    artist: string;
    /** Format name to `legal`, `not_legal`, `banned` or `restricted` */
    legalities: Record<string, string>;
    /** The rules keywords Scryfall recognised on the card */
    keywords: string[];
    /** Whether the card is on the reserved list */
    reserved: boolean;
    /**
     * The card's faces, empty for an ordinary one-sided card.
     *
     * Transform and modal cards carry no cost or rules text on the card itself,
     * adventures and splits carry both halves joined by ` // `. Either way the
     * halves have to be told apart to make sense of them.
     */
    faces: CardFace[];
    /** Market price in euro, `null` when unpriced */
    priceEur: number | null;
    /** Foil market price in euro, `null` when the printing has no priced foil */
    priceEurFoil: number | null;
    /**
     * The finishes this printing was actually produced in, as Scryfall spells
     * them: `nonfoil`, `foil`, `etched`.
     *
     * What makes this worth carrying is the edit form: offering "etched" on a
     * card that was never etched invites recording something that cannot exist.
     */
    finishes: string[];
};

/** One half of a two-faced, split or adventure card */
export type CardFace = {
    /** The face's own name */
    name: string;
    /** The face's own mana cost, empty for a back face you never cast */
    manaCost: string;
    /** The face's own type line */
    typeLine: string;
    /** The face's own rules text */
    oracleText: string;
};

/** Maximum identifiers Scryfall accepts in one `/cards/collection` request */
const BATCH_SIZE = 75;

/**
 * Pause between requests.
 *
 * Scryfall asks for "50 – 100 milliseconds of delay between the requests you
 * send", which is their 10 per second. Sitting at the patient end of that
 * range: resolving an imported collection is thousands of cards, and the
 * difference between this and a self-imposed half second is minutes of waiting.
 *
 * @see https://scryfall.com/docs/api/rate-limits
 */
const REQUEST_INTERVAL_MS = 100;

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
    color_identity?: string[];
    cmc?: number;
    released_at?: string;
    artist?: string;
    legalities?: Record<string, string>;
    keywords?: string[];
    reserved?: boolean;
    image_uris?: { small?: string; normal?: string; large?: string };
    card_faces?: Array<{
        name?: string;
        mana_cost?: string;
        type_line?: string;
        oracle_text?: string;
        image_uris?: { small?: string; normal?: string; large?: string };
    }>;
    prices?: { eur: string | null; eur_foil?: string | null };
    finishes?: string[];
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
 * The tail of the request queue — resolves once the last request may be followed
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs a request once the rate limit allows it.
 *
 * Spacing requests *within* one lookup is not enough: the page list, the search
 * box, the statistics tab and an import are all separate callers, and nothing
 * stopped them from firing at once. Paging quickly through a large collection
 * did exactly that — one request per click, straight past the ten per second
 * Scryfall allows, and their answer to that is a 429 and thirty seconds of
 * silence. Every request in this module goes through here, so the limit holds
 * no matter how many callers there are.
 *
 * @param run issues the request
 *
 * @returns whatever the request returned
 */
function scheduled<T>(run: () => Promise<T>): Promise<T> {
    const result = queue.then(run, run);
    // The queue moves on whether the request worked or not — a failed one still
    // consumed its slot.
    queue = result.then(
        () => delay(REQUEST_INTERVAL_MS),
        () => delay(REQUEST_INTERVAL_MS),
    );
    return result;
}

/**
 * The printings already in memory, without waiting for anything.
 *
 * Lets a component paint what it knows during the render that mounts it,
 * instead of showing placeholders for a frame and swapping the artwork in from
 * an effect. Coming back to a collection is then a page that is simply already
 * there, rather than one that visibly assembles itself.
 *
 * @param ids the printing ids wanted
 *
 * @returns those of them that are known
 */
export function cachedPrintings(ids: string[]): Map<string, Printing> {
    const found = new Map<string, Printing>();
    for (const id of ids) {
        const printing = CACHE.get(id);
        if (printing !== undefined) found.set(id, printing);
    }
    return found;
}

/** Ids whose price is being refreshed right now, so it is not started twice */
const REFRESHING = new Set<string>();

/**
 * Fetches printings and records them in both caches
 *
 * @param ids ids that are not in memory
 * @param onProgress called as batches come back
 */
async function fetchPrintings(ids: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
        const batch = ids.slice(offset, offset + BATCH_SIZE);

        let response: Response;
        try {
            response = await scheduled(() =>
                fetch("https://api.scryfall.com/cards/collection", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
                }),
            );
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
        const printings = (body.data ?? []).map(toPrinting);
        // Written per batch rather than at the end, so an import interrupted
        // half way still leaves what it managed to fetch on disk.
        await writePrintings(printings);
        onProgress?.(Math.min(offset + BATCH_SIZE, ids.length), ids.length);
    }
}

/**
 * Resolves printing ids to card data.
 *
 * Three places are asked in turn: memory, then the on-disk cache, then Scryfall
 * itself in batches of 75 spaced to stay inside the rate limit. Ids Scryfall
 * does not know are simply absent from the result — a printing can be withdrawn
 * by a `delete` migration, and a collection row pointing at one must not break
 * the page.
 *
 * A stored record whose price has aged out is still used, and refreshed in the
 * background. Waiting on a fresh price before showing a card would trade the
 * thing the user is looking at for a number they are not.
 *
 * @param ids the printing ids to resolve, duplicates allowed
 * @param onProgress called with how many ids have been answered, for the rare
 *   case of a collection large enough that the wait needs showing
 *
 * @returns a map from printing id to card data
 */
export async function resolvePrintings(
    ids: string[],
    onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Printing>> {
    const wanted = [...new Set(ids)];
    let missing = wanted.filter((id) => !CACHE.has(id));
    // Progress runs once across both phases rather than restarting when the
    // disk is exhausted and the network takes over — a bar that jumps back to
    // zero reads as a failure.
    const total = missing.length;

    if (missing.length > 0) {
        const stored = await readPrintings(missing, (done) => onProgress?.(done, total));
        const stale: string[] = [];
        for (const [id, record] of stored) {
            CACHE.set(id, record.printing);
            if (record.stale && !REFRESHING.has(id)) stale.push(id);
        }
        missing = missing.filter((id) => !CACHE.has(id));

        if (stale.length > 0) {
            for (const id of stale) REFRESHING.add(id);
            void fetchPrintings(stale).finally(() => {
                for (const id of stale) REFRESHING.delete(id);
            });
        }
    }

    const fromDisk = total - missing.length;
    await fetchPrintings(missing, (done) => onProgress?.(fromDisk + done, total));

    return cachedPrintings(wanted);
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
        faces: (card.card_faces ?? []).map((entry) => ({
            name: entry.name ?? "",
            manaCost: entry.mana_cost ?? "",
            typeLine: entry.type_line ?? "",
            oracleText: entry.oracle_text ?? "",
        })),
        // `scryfall_uri` carries a utm query when it comes from the api; the
        // bare url is what belongs behind a link the user sees.
        scryfallUrl: (card.scryfall_uri ?? "").split("?")[0] ?? "",
        colorIdentity: card.color_identity ?? [],
        manaValue: card.cmc ?? 0,
        releasedAt: card.released_at ?? "",
        artist: card.artist ?? "",
        legalities: card.legalities ?? {},
        keywords: card.keywords ?? [],
        reserved: card.reserved ?? false,
        priceEur: card.prices?.eur !== null && card.prices?.eur !== undefined ? Number(card.prices.eur) : null,
        priceEurFoil:
            card.prices?.eur_foil !== null && card.prices?.eur_foil !== undefined ? Number(card.prices.eur_foil) : null,
        finishes: card.finishes ?? DEFAULT_FINISHES,
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
        response = await scheduled(() => fetch(url, { signal }));
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

/**
 * A card named by a Scryfall url.
 *
 * Which of the two you get depends on what was dragged: a *link* to a card
 * carries set and collector number, while the card *image* has the printing id
 * right in its filename.
 */
export type DroppedCard =
    | {
          /** The url named the printing directly */
          kind: "id";
          /** Scryfall's id of the printing */
          id: string;
      }
    | {
          /** The url named a slot in a set */
          kind: "coordinate";
          /** The set's three to five letter code */
          setCode: string;
          /** The collector number within that set */
          collectorNumber: string;
          /** The language, when the url names one */
          lang?: string;
      };

/** Matches a printing id wherever it sits in an image path */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Reads a Scryfall url that names a card.
 *
 * Covers both things a browser hands over on a drag. Dragging a link — a hit on
 * a search page, or the address bar — gives the card page,
 * `https://scryfall.com/card/hob/1/long-bodied-grey-dog`. Dragging the artwork
 * off an open card page gives the image file instead,
 * `https://cards.scryfall.io/display/front/1/7/1704d11c-….webp?1783948590`,
 * whose file name is the printing id.
 *
 * @param url the url to read
 *
 * @returns what the url names, or `null` when it names no card
 */
export function parseCardUrl(url: string): DroppedCard | null {
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
    } catch {
        return null;
    }

    // The image host: the id is the file name, so nothing has to be looked up.
    if (/(^|\.)scryfall\.io$/.test(parsed.hostname)) {
        const found = UUID_PATTERN.exec(parsed.pathname);
        return found === null ? null : { kind: "id", id: found[0].toLowerCase() };
    }

    if (!/(^|\.)scryfall\.com$/.test(parsed.hostname)) return null;

    const [card, setCode, collectorNumber, fourth] = parsed.pathname.split("/").filter((part) => part !== "");
    if (card !== "card" || setCode === undefined || collectorNumber === undefined) return null;

    return {
        kind: "coordinate",
        setCode,
        collectorNumber,
        lang: fourth !== undefined && LANGS.has(fourth) ? fourth : undefined,
    };
}

/**
 * Resolves what {@link parseCardUrl} read to an actual printing.
 *
 * This is how something dragged in from Scryfall becomes a row the collection
 * can store. An id goes through the ordinary batch lookup and is usually
 * already cached; a coordinate needs the set and collector number endpoint.
 *
 * @param dropped what the url named, see {@link parseCardUrl}
 *
 * @returns the printing, or `null` when Scryfall does not know it
 */
export async function resolveCardUrl(dropped: DroppedCard): Promise<Printing | null> {
    if (dropped.kind === "id") {
        return (await resolvePrintings([dropped.id])).get(dropped.id) ?? null;
    }

    const parts = [dropped.setCode, dropped.collectorNumber, dropped.lang]
        .filter((part) => part !== undefined)
        .map((part) => encodeURIComponent(part));

    let response: Response;
    try {
        response = await scheduled(() => fetch(`https://api.scryfall.com/cards/${parts.join("/")}`));
    } catch (error) {
        console.error("Could not reach Scryfall", error);
        return null;
    }
    if (!response.ok) return null;

    return toPrinting((await response.json()) as ScryfallCard);
}
