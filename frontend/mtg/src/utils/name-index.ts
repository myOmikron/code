//! Name-based lookup over the all-card index. Loads the compact name→locations map
//! (`names.json.gz`) and fuzzy-matches OCR'd card titles against the closed vocabulary of
//! real card names — imperfect OCR still resolves to the right card because the candidate
//! set is fixed. Runs inside the scan worker.
const INDEX_ROOT = "/data/all-card-index";

/** Bump together with `NAME_INDEX_FORMAT` in scripts/build-name-index.mjs. */
export const NAME_INDEX_FORMAT = 1;

/** `[setIndex, position]` into the manifest sets and their shards. */
export type CardLocation = [number, number];

/**
 * The name index file: every card name with the shards it appears in
 */
type NameIndexPayload = {
    formatVersion: number;
    indexVersion: string;
    names: Array<[string, CardLocation[]]>;
};

/**
 * Must stay identical to `normalizeName` in scripts/build-name-index.mjs.
 *
 * @param name
 * @returns the normalised name
 */
export function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * The character bigrams of a normalised name, used as the fuzzy-match features
 *
 * @param normalized
 * @returns
 */
function bigrams(normalized: string): Set<string> {
    const compact = normalized.replace(/ /g, "");
    const set = new Set<string>();
    for (let index = 0; index < compact.length - 1; index += 1) {
        set.add(compact.slice(index, index + 2));
    }
    return set;
}

/**
 * Containment: fraction of the OCR fragment's bigrams that appear in the card name. Unlike
 * symmetric Dice, a truncated-but-correct read ("zada hedro" ⊂ "zada hedron grinder") scores
 * ~1.0 instead of being penalised for the missing tail. Short fragments are gated separately
 * (they'd hit 1.0 against unrelated names), so this only runs on fragments long enough to
 * trust.
 *
 * @param query
 * @param target
 * @returns
 */
function containmentScore(query: Set<string>, target: Set<string>): number {
    if (query.size === 0 || target.size === 0) return 0;
    let intersection = 0;
    for (const gram of query) if (target.has(gram)) intersection += 1;
    return intersection / query.size;
}

// Minimum bigrams (~7+ chars) for a fuzzy fragment to be trusted. Below this, a fragment can
// be fully "contained" in unrelated names (e.g. garbled "br ary" ⊂ "Library"), so we ignore
// it rather than let it hijack the result.
const MIN_QUERY_BIGRAMS = 6;

/**
 * The name index in memory, with its bigram lookup
 */
type LoadedNameIndex = {
    byName: Map<string, CardLocation[]>;
    entries: Array<{ name: string; bigrams: Set<string>; locations: CardLocation[] }>;
};

let pending: Promise<LoadedNameIndex> | null = null;

/**
 * Downloads and decodes the name index
 *
 * @returns
 */
async function fetchNameIndex(): Promise<LoadedNameIndex> {
    const response = await fetch(`${INDEX_ROOT}/names.json.gz`, { cache: "no-cache" });
    if (!response.ok) throw new Error("Namensindex nicht erreichbar.");
    let payload: NameIndexPayload;
    if (response.headers.get("content-encoding")?.includes("gzip")) {
        payload = (await response.json()) as NameIndexPayload;
    } else if (response.body && typeof DecompressionStream !== "undefined") {
        const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
        payload = (await new Response(stream).json()) as NameIndexPayload;
    } else {
        throw new Error("Dieser Browser kann den komprimierten Namensindex nicht lesen.");
    }
    if (payload.formatVersion !== NAME_INDEX_FORMAT) {
        throw new Error("Namensindex-Format ist inkompatibel.");
    }
    return {
        byName: new Map(payload.names),
        entries: payload.names.map(([name, locations]) => ({ name, bigrams: bigrams(name), locations })),
    };
}

/**
 * Loads the name index once and keeps it
 *
 * @returns the loaded name index
 */
export function loadNameIndex(): Promise<LoadedNameIndex> {
    if (!pending) pending = fetchNameIndex();
    return pending;
}

/**
 * A card name the OCR text resolved to, with its score and where the card lives
 */
export type NameMatch = { name: string; score: number; locations: CardLocation[] };

/**
 * Resolves an already normalised string against the closed vocabulary of card names
 *
 * @param normalized
 * @param index
 * @returns
 */
function matchNormalized(normalized: string, index: LoadedNameIndex): NameMatch | null {
    const exact = index.byName.get(normalized);
    if (exact) return { name: normalized, score: 1, locations: exact };
    const query = bigrams(normalized);
    if (query.size < MIN_QUERY_BIGRAMS) return null;
    let best: NameMatch | null = null;
    for (const entry of index.entries) {
        // Prefer the tightest containing name: full containment, tie-broken toward names not much
        // longer than the fragment (so "zada hedro" prefers "Zada, Hedron Grinder" over a longer
        // name that happens to contain the same bigrams).
        const contained = containmentScore(query, entry.bigrams);
        const tightness = 1 - Math.min(1, Math.max(0, entry.bigrams.size - query.size) / entry.bigrams.size);
        const score = contained * (0.85 + 0.15 * tightness);
        if (!best || score > best.score) best = { name: entry.name, score, locations: entry.locations };
    }
    return best;
}

/**
 * Best fuzzy name match for OCR'd title text, or null below `minScore`. The raw OCR may be
 * multi-line and may append stray tokens to a short title (a single-line read of "Nazgûl"
 * comes back as "Nazgul Ea"), so we match the whole text, each line, AND each individual word,
 * keeping the strongest hit. Candidates are tried whole→lines→words and ties keep the earlier
 * (longer) one, so a clean multi-word title still beats one of its words matching a shorter
 * card name.
 */
// Above this line-level score we do NOT fall back to matching individual words: a strong
// whole-title match must not be overridden by one of its words exact-matching a shorter card
// (e.g. "charge" of "Inspired Charge" matching the card "Charge").
const WORD_FALLBACK_BELOW = 0.85;

// Share of a line's letters a single word must cover to be worth matching on its own.
//
// A quarter of all card names contain a word that is itself a card name ("Zombie" in "Zombie
// Master", "Spider" in "Spider-Man, Brooklyn Visionary", "Oracle" in "Storm God's Oracle"). A
// clipped or blurred title therefore reads as a *fragment* that exact-matches some other real
// card, which then sails through at score 1.0 — the wrong card, with maximum confidence. Requiring
// the word to dominate its line keeps the case the fallback exists for (a short title read with
// stray tokens: "Nazgul Ea" → "nazgul" is 6 of 8 letters) and drops fragments of a longer title
// ("spider" is 6 of 23 letters of "spider man brooklyn vision").
const WORD_DOMINANCE = 0.6;

/**
 * Words worth matching on their own: per line, a word long enough to carry meaning that also
 *  makes up most of that line. Exported for testing — this is the guard against fragment reads.
 *
 * @param ocrText
 * @returns the words worth matching on
 */
export function dominantWords(ocrText: string): string[] {
    const words = new Set<string>();
    for (const rawLine of ocrText.split(/\n+/)) {
        const line = normalizeName(rawLine);
        if (!line) continue;
        const letters = line.replace(/ /g, "").length;
        for (const word of line.split(" ")) {
            if (word.length >= 4 && word.length >= letters * WORD_DOMINANCE) words.add(word);
        }
    }
    return [...words];
}

/**
 * The best-scoring candidate of a set of names
 *
 * @param candidates
 * @param index
 * @returns
 */
function bestOfCandidates(candidates: Iterable<string>, index: LoadedNameIndex): NameMatch | null {
    let best: NameMatch | null = null;
    for (const candidate of candidates) {
        const match = matchNormalized(candidate, index);
        if (match && (!best || match.score > best.score)) best = match;
    }
    return best;
}

/**
 * The basic land names. They are the only card names that appear in a card's *lower* name
 *  banner (full-art layouts), and they are also the names the general fuzzy path cannot help:
 *  "plains", "island", "swamp", "forest" and "wastes" all have fewer than `MIN_QUERY_BIGRAMS`
 *  bigrams, so without this they would have to be read letter-perfect or be discarded.
 */
const BASIC_LAND_NAMES = ["plains", "island", "swamp", "forest", "mountain", "wastes"];

/**
 * Levenshtein distance, abandoned once it exceeds the limit
 *
 * @param left
 * @param right
 * @param limit
 * @returns
 */
function editDistanceWithin(left: string, right: string, limit: number): number {
    if (Math.abs(left.length - right.length) > limit) return -1;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
        const current = [i];
        let rowBest = i;
        for (let j = 1; j <= right.length; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
            rowBest = Math.min(rowBest, current[j]);
        }
        if (rowBest > limit) return -1; // no completion can come back under the limit
        previous = current;
    }
    return previous[right.length] <= limit ? previous[right.length] : -1;
}

/**
 * Match OCR text against the basic land names only, tolerating a couple of wrong characters.
 *
 * This is deliberately a separate, closed vocabulary rather than a loosening of the general
 * fuzzy gate: with six mutually distant words a two-character slip ("Plaine", "Isand", "Swanp")
 * is still unambiguous, whereas the same tolerance over all 35k card names would let garbage
 * hijack a result. A candidate matching two different land names is rejected as ambiguous.
 *
 * @param ocrText
 * @returns the basic land, or null if the text is not one
 */
export async function matchBasicLandName(ocrText: string): Promise<NameMatch | null> {
    const index = await loadNameIndex();
    const candidates = new Set<string>([normalizeName(ocrText)]);
    for (const line of ocrText.split(/\n+/)) candidates.add(normalizeName(line));
    for (const word of ocrText.split(/\s+/)) {
        const normalized = normalizeName(word);
        if (normalized.length >= 4) candidates.add(normalized);
    }

    let best: NameMatch | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
        if (!candidate) continue;
        const hits: Array<{ name: string; distance: number }> = [];
        for (const land of BASIC_LAND_NAMES) {
            const distance = editDistanceWithin(candidate, land, 2);
            if (distance >= 0) hits.push({ name: land, distance });
        }
        if (hits.length !== 1) continue; // no match, or ambiguous between two lands
        const [hit] = hits;
        if (hit.distance >= bestDistance) continue;
        const locations = index.byName.get(hit.name);
        if (!locations) continue;
        bestDistance = hit.distance;
        // An exact read is certain; each wrong character costs confidence but stays above the
        // OCR_NAME_MIN gate, since within this vocabulary even a 2-edit read is unambiguous.
        best = { name: hit.name, score: hit.distance === 0 ? 1 : hit.distance === 1 ? 0.95 : 0.88, locations };
    }
    return best;
}

/**
 * Resolves OCR text to a real card name
 *
 * @param ocrText
 * @param minScore
 * @returns the matched name, or null if nothing scored high enough
 */
export async function matchCardName(ocrText: string, minScore = 0.6): Promise<NameMatch | null> {
    const index = await loadNameIndex();
    const lines = new Set<string>([normalizeName(ocrText), ...ocrText.split(/\n+/).map(normalizeName)]);
    let best = bestOfCandidates(lines, index);

    // Only when the whole/line match is weak, also try individual words — this rescues a short
    // single-word title read with stray trailing tokens ("Nazgul Ea" → word "Nazgul" → exact).
    // Restricted to words that dominate their line, so a fragment of a longer title cannot
    // exact-match an unrelated shorter card (see WORD_DOMINANCE).
    if (!best || best.score < WORD_FALLBACK_BELOW) {
        const wordBest = bestOfCandidates(dominantWords(ocrText), index);
        if (wordBest && (!best || wordBest.score > best.score)) best = wordBest;
    }
    return best && best.score >= minScore ? best : null;
}
