//! Name-based lookup over the all-card index. Loads the compact name→locations map
//! (`names.json.gz`) and fuzzy-matches OCR'd card titles against the closed vocabulary of
//! real card names — imperfect OCR still resolves to the right card because the candidate
//! set is fixed. Runs inside the scan worker.
const INDEX_ROOT = "/data/all-card-index";

/** Bump together with `NAME_INDEX_FORMAT` in scripts/build-name-index.mjs. */
export const NAME_INDEX_FORMAT = 1;

/** `[setIndex, position]` into the manifest sets and their shards. */
export type CardLocation = [number, number];

type NameIndexPayload = {
  formatVersion: number;
  indexVersion: string;
  names: Array<[string, CardLocation[]]>;
};

/** Must stay identical to `normalizeName` in scripts/build-name-index.mjs. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(normalized: string): Set<string> {
  const compact = normalized.replace(/ /g, "");
  const set = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    set.add(compact.slice(index, index + 2));
  }
  return set;
}

// Containment: fraction of the OCR fragment's bigrams that appear in the card name. Unlike
// symmetric Dice, a truncated-but-correct read ("zada hedro" ⊂ "zada hedron grinder") scores
// ~1.0 instead of being penalised for the missing tail. Short fragments are gated separately
// (they'd hit 1.0 against unrelated names), so this only runs on fragments long enough to
// trust.
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

type LoadedNameIndex = {
  byName: Map<string, CardLocation[]>;
  entries: Array<{ name: string; bigrams: Set<string>; locations: CardLocation[] }>;
};

let pending: Promise<LoadedNameIndex> | null = null;

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

export function loadNameIndex(): Promise<LoadedNameIndex> {
  if (!pending) pending = fetchNameIndex();
  return pending;
}

export type NameMatch = { name: string; score: number; locations: CardLocation[] };

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

function bestOfCandidates(candidates: Iterable<string>, index: LoadedNameIndex): NameMatch | null {
  let best: NameMatch | null = null;
  for (const candidate of candidates) {
    const match = matchNormalized(candidate, index);
    if (match && (!best || match.score > best.score)) best = match;
  }
  return best;
}

/** The basic land names. They are the only card names that appear in a card's *lower* name
 *  banner (full-art layouts), and they are also the names the general fuzzy path cannot help:
 *  "plains", "island", "swamp", "forest" and "wastes" all have fewer than `MIN_QUERY_BIGRAMS`
 *  bigrams, so without this they would have to be read letter-perfect or be discarded. */
const BASIC_LAND_NAMES = ["plains", "island", "swamp", "forest", "mountain", "wastes"];

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

export async function matchCardName(ocrText: string, minScore = 0.6): Promise<NameMatch | null> {
  const index = await loadNameIndex();
  const lines = new Set<string>([normalizeName(ocrText), ...ocrText.split(/\n+/).map(normalizeName)]);
  let best = bestOfCandidates(lines, index);

  // Only when the whole/line match is weak, also try individual words — this rescues a short
  // single-word title read with stray trailing tokens ("Nazgul Ea" → word "Nazgul" → exact).
  if (!best || best.score < WORD_FALLBACK_BELOW) {
    const words = new Set<string>();
    for (const word of ocrText.split(/\s+/)) {
      const n = normalizeName(word);
      if (n.length >= 4) words.add(n);
    }
    const wordBest = bestOfCandidates(words, index);
    if (wordBest && (!best || wordBest.score > best.score)) best = wordBest;
  }
  return best && best.score >= minScore ? best : null;
}
