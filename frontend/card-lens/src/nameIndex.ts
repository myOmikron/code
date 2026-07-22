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

function diceScore(query: Set<string>, target: Set<string>): number {
  if (query.size === 0 || target.size === 0) return 0;
  let intersection = 0;
  for (const gram of query) if (target.has(gram)) intersection += 1;
  return (2 * intersection) / (query.size + target.size);
}

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
  if (normalized.length < 3) return null;
  const exact = index.byName.get(normalized);
  if (exact) return { name: normalized, score: 1, locations: exact };
  const query = bigrams(normalized);
  let best: NameMatch | null = null;
  for (const entry of index.entries) {
    const score = diceScore(query, entry.bigrams);
    if (!best || score > best.score) best = { name: entry.name, score, locations: entry.locations };
  }
  return best;
}

/**
 * Best fuzzy name match for OCR'd title text, or null below `minScore`. The raw OCR may be
 * multi-line (the title band can pick up stray text), so each line — and the whole text — is
 * matched and the strongest hit wins.
 */
export async function matchCardName(ocrText: string, minScore = 0.6): Promise<NameMatch | null> {
  const index = await loadNameIndex();
  const candidates = new Set<string>();
  candidates.add(normalizeName(ocrText));
  for (const line of ocrText.split(/\n+/)) candidates.add(normalizeName(line));

  let best: NameMatch | null = null;
  for (const candidate of candidates) {
    const match = matchNormalized(candidate, index);
    if (match && (!best || match.score > best.score)) best = match;
  }
  return best && best.score >= minScore ? best : null;
}
