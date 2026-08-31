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

import { editDistanceWithin, normalizeName } from "src/utils/name-index";
import { readPrintings, writePrintings } from "src/utils/printing-store";

/**
 * What a printing is assumed to have been produced in when nothing says
 * otherwise.
 *
 * Claiming no finishes at all would leave the edit form with nothing to offer;
 * every card exists as a plain one.
 */
export const DEFAULT_FINISHES = ["nonfoil"];

/**
 * What makes typed words a Scryfall query rather than a card name: a filter
 * like `t:goblin`, a comparison like `cmc<=2`, grouping parentheses, or a
 * negated word. A quoted or `!`-exact name is still a name — it names exactly
 * one card, which is the case being told apart here.
 */
export const QUERY_SYNTAX = /[:<>=()]|(^|\s)-/;

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
    /**
     * The back face's small artwork, `null` for a card with one side.
     *
     * Only a card photographed twice has one: a transform card, a modal
     * double-faced card, a battle. A split card or an adventure has faces but a
     * single picture, so there is nothing to turn over.
     */
    backImageUrl: string | null;
    /** The back face's full-size artwork, see {@link Printing.backImageUrl} */
    backLargeImageUrl: string | null;
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

/** How many search hits compact consumers keep from the first page */
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
    const sources = [card.image_uris, card.card_faces?.[0]?.image_uris];
    for (const source of sources) {
        const found = scan(source, size);
        if (found !== null) return found;
    }
    return null;
}

/**
 * Picks the artwork of the back face
 *
 * @param card the Scryfall card object
 * @param size which end of the available scans to prefer
 *
 * @returns an image url, or `null` when the card has only one side
 */
function backImageUrl(card: ScryfallCard, size: "small" | "large"): string | null {
    return scan(card.card_faces?.[1]?.image_uris, size);
}

/**
 * Takes the scan closest to the wanted size out of one set of urls
 *
 * @param uris what Scryfall offers, which is nothing at all for a face it did
 *     not photograph on its own
 * @param size which end of the available scans to prefer
 *
 * @returns an image url, or `null` when there is none
 */
function scan(uris: { small?: string; normal?: string; large?: string } | undefined, size: "small" | "large") {
    const order = size === "small" ? (["small", "normal", "large"] as const) : (["normal", "large", "small"] as const);
    for (const key of order) {
        const found = uris?.[key];
        if (found !== undefined) return found;
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
        backImageUrl: backImageUrl(card, "small"),
        backLargeImageUrl: backImageUrl(card, "large"),
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
 * Filter terms are passed through untouched, so the full Scryfall syntax works
 * — `bolt set:2ed`, `t:goblin cmc<=2`, `!"Sol Ring"`. Sorting terms are moved
 * to the API's dedicated parameters; unlike scryfall.com, `/cards/search` does
 * not turn `sort:edhrec` in `q` into `order=edhrec` itself.
 *
 * Whether a card comes back once or once per print run is the caller's call:
 * filing a physical card means picking the exact print run it came out of, and
 * building a deck means picking the card, with the print run a question for
 * later.
 *
 * @param query the Scryfall search query
 * @param signal aborts an in-flight search when the input moves on
 * @param unique one row per print run, or one per card
 *
 * @returns the first matching page in the requested order, or an empty array
 */
export async function searchPrintings(
    query: string,
    signal?: AbortSignal,
    unique: "prints" | "cards" = "prints",
): Promise<Printing[]> {
    const page = await searchPrintingPage(query, signal, unique);
    return page.printings.slice(0, SEARCH_LIMIT);
}

/** How many pages a full search follows before giving up */
const MAX_SEARCH_PAGES = 20;

/**
 * Searches Scryfall for every printing matching a query, page by page.
 *
 * `/cards/search` answers at most 175 rows per request, which a heavily
 * reprinted card exceeds, so the later prints never showed up at all. The
 * cursor is followed until Scryfall reports no further page.
 *
 * @param query the Scryfall search query
 * @param signal aborts an in-flight search when the input moves on
 * @param onPage called with everything found so far after each page arrives
 *
 * @returns every matching printing, in Scryfall's order
 */
export async function searchAllPrintings(
    query: string,
    signal?: AbortSignal,
    onPage?: (printings: Printing[]) => void,
): Promise<Printing[]> {
    const all: Printing[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
        const result = await searchPrintingPage(query, signal, "prints", cursor);
        if (signal?.aborted === true) return all;
        all.push(...result.printings);
        onPage?.([...all]);
        if (result.nextPage === null) break;
        cursor = result.nextPage;
    }

    return all;
}

/** One page of card-search results and Scryfall's opaque cursor to the next */
export type PrintingSearchPage = {
    printings: Printing[];
    nextPage: string | null;
};

/**
 * Searches one page of Scryfall printings.
 *
 * Passing `nextPage` follows the cursor returned by an earlier call. The URL is
 * deliberately treated as opaque: it carries the page number and every search
 * option Scryfall needs to keep the result order stable.
 *
 * @param query the Scryfall query used for the first page
 * @param signal aborts an in-flight search
 * @param unique one row per print run, or one per card
 * @param nextPage cursor returned by the preceding page
 *
 * @returns one full Scryfall page and the cursor following it
 */
export async function searchPrintingPage(
    query: string,
    signal?: AbortSignal,
    unique: "prints" | "cards" = "prints",
    nextPage?: string,
): Promise<PrintingSearchPage> {
    const trimmed = query.trim();
    if (trimmed === "" && nextPage === undefined) return { printings: [], nextPage: null };

    const url = nextPage === undefined ? new URL("https://api.scryfall.com/cards/search") : new URL(nextPage);
    if (nextPage === undefined) {
        // The website accepts both spellings in its search box and translates
        // the directive before calling the API. Do the same here. Leaving it
        // in `q` while forcing `order=released` returns newly released cards
        // instead of, for example, EDHREC staples.
        //
        // The last directive wins and every one is stripped: a caller may put
        // a default sort in front of what was typed, and typing another has to
        // override it rather than leave a directive in `q` Scryfall's API
        // rejects as an unknown keyword.
        const sortDirective = /(^|\s)(?:sort|order):([a-z][a-z-]*)(?=\s|$)/gi;
        const sort = [...trimmed.matchAll(sortDirective)].at(-1)?.[2]?.toLowerCase();
        const filters = sort === undefined ? trimmed : trimmed.replace(sortDirective, "$1").trim();

        url.searchParams.set("q", filters);
        url.searchParams.set("unique", unique);
        url.searchParams.set("order", sort ?? "released");
        // `auto` is significant for ranks: a lower EDHREC rank is better,
        // whereas the default release ordering is deliberately newest first.
        url.searchParams.set("dir", sort === undefined ? "desc" : "auto");
    }

    let response: Response;
    try {
        response = await scheduled(() => fetch(url, { signal }));
    } catch (error) {
        if (signal?.aborted === true) return { printings: [], nextPage: null };
        console.error("Could not reach Scryfall", error);
        return { printings: [], nextPage: null };
    }

    // Scryfall answers 404 when a valid query simply matches nothing — that is
    // an empty result, not a failure worth reporting.
    if (response.status === 404) return { printings: [], nextPage: null };
    if (!response.ok) {
        console.error("Scryfall answered", response.status);
        return { printings: [], nextPage: null };
    }

    const body = (await response.json()) as { data?: ScryfallCard[]; has_more?: boolean; next_page?: string };
    return {
        printings: (body.data ?? []).map(toPrinting),
        nextPage: body.has_more === true ? (body.next_page ?? null) : null,
    };
}

/**
 * Asks Scryfall which card a misspelled or partial name meant.
 *
 * Only the name comes back, not a printing: the caller re-runs its ordinary
 * constrained search with the corrected name, so format and colour rules
 * apply to the correction exactly as they would to a well-typed query.
 * Scryfall answers 404 both for "nothing close" and "too ambiguous", and
 * either way the answer here is the same: no correction to offer.
 *
 * @param name what was typed
 * @param signal aborts the lookup when the input moves on
 *
 * @returns the card's real name, or `null` when there is no single answer
 */
export async function fuzzyCardName(name: string, signal?: AbortSignal): Promise<string | null> {
    const url = new URL("https://api.scryfall.com/cards/named");
    url.searchParams.set("fuzzy", name);
    let response: Response;
    try {
        response = await scheduled(() => fetch(url, { signal }));
    } catch (error) {
        if (signal?.aborted !== true) console.error("Could not reach Scryfall", error);
        return null;
    }
    if (response.status === 404) return null;
    if (!response.ok) {
        console.error("Scryfall answered", response.status);
        return null;
    }
    const body = (await response.json()) as { name?: string };
    return body.name ?? null;
}

/**
 * The words real card names are made of, built once from Scryfall's card-name
 * catalog and kept for the tab's lifetime.
 *
 * Fetched lazily — the first zero-hit search that needs a word repaired pays
 * for the catalog, ordinary searches never do. A failed fetch clears the slot
 * so a later mistype can try again instead of being stuck with the failure.
 */
let cardWords: Promise<Set<string>> | null = null;

/**
 * Fetches the catalog and reduces it to its unique normalised words
 *
 * @param signal aborts the fetch when the input moves on
 *
 * @returns every word that appears in a real card name
 */
function loadCardWords(signal?: AbortSignal): Promise<Set<string>> {
    if (cardWords === null) {
        cardWords = scheduled(() => fetch("https://api.scryfall.com/catalog/card-names", { signal }))
            .then(async (response) => {
                if (!response.ok) throw new Error(`Scryfall answered ${response.status}`);
                const body = (await response.json()) as { data?: string[] };
                const words = new Set<string>();
                for (const name of body.data ?? []) {
                    for (const word of normalizeName(name).split(" ")) {
                        if (word.length >= 2) words.add(word);
                    }
                }
                return words;
            })
            .catch((error: unknown) => {
                cardWords = null;
                throw error;
            });
    }
    return cardWords;
}

/**
 * How many edits a word may be from a real card-name word to be repaired
 *
 * @param word the typed word
 *
 * @returns the edit-distance ceiling for it
 */
function editLimit(word: string): number {
    return word.length <= 4 ? 1 : 3;
}

/** A real card-name word near another word, with the edit distance between them */
type NearWord = { word: string; distance: number };

/**
 * At most how many near words one ambiguous word contributes.
 *
 * Ties at the closest distance are common, not rare: "hellfire" sits equally
 * two edits from "hellkite", "hellride" and "hailfire" alike, and only one of
 * those is ever the card that was meant. Picking a single "closest" match
 * would pick arbitrarily among them — several are tried instead, so the real
 * one is not left out on a coin flip.
 */
const MAX_CANDIDATES_PER_WORD = 4;

/**
 * The real card-name words closest to a word, nearest first
 *
 * @param word the word to match
 * @param words the vocabulary
 * @param exclude a word to leave out of the search — its own spelling, when
 *   looking for what else it could have meant
 *
 * @returns up to {@link MAX_CANDIDATES_PER_WORD} words within the edit-distance
 *   limit, nearest first
 */
function nearWords(word: string, words: Set<string>, exclude: string | null): NearWord[] {
    const limit = editLimit(word);
    const hits: NearWord[] = [];
    for (const candidate of words) {
        if (candidate === exclude) continue;
        const distance = editDistanceWithin(word, candidate, limit);
        if (distance >= 0) hits.push({ word: candidate, distance });
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits.slice(0, MAX_CANDIDATES_PER_WORD);
}

/**
 * At most how many "this word is real, but maybe the wrong one" guesses
 * {@link correctCardWords} offers in total, so a long or heavily ambiguous
 * query cannot spawn an unbounded run of extra searches
 */
const MAX_ALTERNATE_CANDIDATES = 6;

/**
 * Repairs a mistyped query word by word against the vocabulary of real card
 * names, and offers a candidate for each word that might be the wrong word.
 *
 * The second line of defence behind {@link fuzzyCardName}: Scryfall's fuzzy
 * lookup only answers when the input pins down a single card, so a mistyped
 * word that opens many names — "Unnderworld" — gets nothing from it. Here
 * each word that is no real card word is replaced by the closest one that is,
 * within one edit for short words and three for longer ones — that repaired
 * query is the first candidate.
 *
 * A word already spelled correctly is not proof it is the *right* word:
 * "Torment of Hellfire" reads as a real name right up until it is checked
 * against real cards — "Hellfire" is a card of its own, but "Torment of
 * Hailfire" was meant. So every already-valid word also gets candidates of
 * its own, holding the rest of the query fixed and swapping just that one
 * word for another real word near it — several near words, not one, since
 * "Hellfire" sits equally close to "Hellkite", "Hellride" and "Hailfire" and
 * only trying the single nearest would leave the right one to chance. Tried
 * one word at a time rather than every valid word open to change at once,
 * since that would as often break a correct word as fix a wrong one.
 *
 * A wrong guess is cheap: the caller tries each candidate in turn, closest
 * first, and only shows the one that actually finds a card.
 *
 * @param query what was typed
 * @param signal aborts the catalog fetch when the input moves on
 *
 * @returns candidate repaired queries, best guess first, empty when there is
 *   nothing to offer
 */
export async function correctCardWords(query: string, signal?: AbortSignal): Promise<string[]> {
    let words: Set<string>;
    try {
        words = await loadCardWords(signal);
    } catch (error) {
        if (signal?.aborted !== true) console.error("Could not load Scryfall's card names", error);
        return [];
    }

    const typed = normalizeName(query)
        .split(" ")
        .filter((word) => word !== "");
    const baseline = [...typed];
    let baselineChanged = false;
    // Every (position, alternate) worth trying, merged across every
    // already-valid word rather than kept one bucket per word — sorted by
    // distance below, so a single tightly-tied word cannot crowd every other
    // word's chance out of the shared budget.
    const alternates: Array<{ index: number } & NearWord> = [];

    for (const [index, word] of typed.entries()) {
        if (word.length < 3) continue;
        if (words.has(word)) {
            for (const near of nearWords(word, words, word)) alternates.push({ index, ...near });
            continue;
        }
        const [nearest] = nearWords(word, words, null);
        if (nearest !== undefined) {
            baseline[index] = nearest.word;
            baselineChanged = true;
        }
    }
    alternates.sort((a, b) => a.distance - b.distance);

    const candidates: string[] = [];
    if (baselineChanged) candidates.push(baseline.join(" "));
    for (const { index, word } of alternates.slice(0, MAX_ALTERNATE_CANDIDATES)) {
        const variant = [...baseline];
        variant[index] = word;
        candidates.push(variant.join(" "));
    }
    return candidates;
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
