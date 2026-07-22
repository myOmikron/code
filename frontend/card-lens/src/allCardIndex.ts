import { hammingDistance, printingSimilarity, signatureSimilarity, signatureSimilarityBreakdown } from "./imageHash";
import { matchCardName } from "./nameIndex";
import type { CardRecord, ImageSignature, IndexedCard, MatchCandidate } from "./types";

const INDEX_ROOT = "/data/all-card-index";
const ROUTE_SHORTLIST_SIZE = 600;
const SHARD_CONCURRENCY = 8;
// Max Hamming distance between two 64-bit artwork hashes to treat printings as the same art.
const ARTWORK_SAME_THRESHOLD = 4;

type SerializedSignature = {
  differenceHash: string;
  averageHash: string;
  artworkHash: string;
  detailVector: string;
  artworkVector: string;
  artworkEdgeVector: string;
  spatialColorVector: string;
  titleVector: string;
  setSymbolVector: string;
  footerVector: string;
  stampVector: string;
  chromaVector: string;
  edgeVector: string;
  colorVector: string;
  dominantColor: number;
};

type SerializedCard = CardRecord & { signature: SerializedSignature };

type ManifestSet = {
  code: string;
  name: string;
  cardCount: number;
  file: string;
};

type Manifest = {
  formatVersion: number;
  indexVersion: string;
  complete: boolean;
  setCount: number;
  cardCount: number;
  totalCardCount: number;
  routingFile: string;
  sets: ManifestSet[];
};

type SerializedRoute = [number, number, string, string, string, string, string, string, string, string];
export type RuntimeRoute = [number, number, string, string, Uint8Array, Uint8Array, Uint8Array, Uint8Array, string, Uint8Array];

type RoutingPayload = {
  formatVersion: number;
  indexVersion: string;
  complete: boolean;
  entries: SerializedRoute[];
};

type RuntimeIndex = {
  manifest: Manifest;
  routes: RuntimeRoute[];
};

export type AllCardIndexSummary = {
  cardCount: number;
  totalCardCount: number;
  setCount: number;
  complete: boolean;
};

type ScoredRoute = { route: RuntimeRoute; score: number };

let pendingIndex: Promise<RuntimeIndex> | null = null;
const shardCache = new Map<number, Promise<SerializedCard[]>>();

function decodeBytes(value: string): Uint8Array {
  // `atob` is a global in both window and worker scopes; avoid `window` so this module
  // can run inside the scan worker.
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeVector(value: string): number[] {
  return Array.from(decodeBytes(value), (byte) => byte / 255);
}

function decodeCard(card: SerializedCard): IndexedCard {
  return {
    ...card,
    signature: {
      differenceHash: card.signature.differenceHash,
      averageHash: card.signature.averageHash,
      artworkHash: card.signature.artworkHash,
      detailVector: decodeVector(card.signature.detailVector),
      artworkVector: decodeVector(card.signature.artworkVector),
      artworkEdgeVector: decodeVector(card.signature.artworkEdgeVector),
      spatialColorVector: decodeVector(card.signature.spatialColorVector),
      titleVector: decodeVector(card.signature.titleVector),
      setSymbolVector: decodeVector(card.signature.setSymbolVector),
      footerVector: decodeVector(card.signature.footerVector),
      stampVector: decodeVector(card.signature.stampVector),
      chromaVector: decodeVector(card.signature.chromaVector),
      edgeVector: decodeVector(card.signature.edgeVector),
      colorVector: decodeVector(card.signature.colorVector),
      dominantColor: card.signature.dominantColor,
    },
  };
}

function chromaSimilarity(left: number[], right: Uint8Array): number {
  if (left.length !== 13 || right.length !== 13) return 0;
  let hueIntersection = 0;
  for (let index = 0; index < 12; index += 1) {
    hueIntersection += Math.min(left[index], right[index] / 255);
  }
  const saturationScore = 1 - Math.min(1, Math.abs(left[12] - right[12] / 255) * 2);
  return hueIntersection * 0.8 + saturationScore * 0.2;
}

function compactSpatialColor(values: number[]): number[] {
  const output: number[] = [];
  for (let targetY = 0; targetY < 5; targetY += 1) {
    for (let targetX = 0; targetX < 6; targetX += 1) {
      const sourceX = Math.min(11, Math.floor(((targetX + 0.5) * 12) / 6));
      const sourceY = Math.min(8, Math.floor(((targetY + 0.5) * 9) / 5));
      const offset = (sourceY * 12 + sourceX) * 3;
      output.push(values[offset], values[offset + 1], values[offset + 2]);
    }
  }
  return output;
}

function compactSpatialSimilarity(left: number[], right: Uint8Array): number {
  if (left.length !== 90 || right.length !== 90) return 0;
  let distance = 0;
  for (let index = 0; index < left.length; index += 3) {
    const red = left[index] - right[index] / 255;
    const green = left[index + 1] - right[index + 1] / 255;
    const blue = left[index + 2] - right[index + 2] / 255;
    distance += Math.sqrt(red * red + green * green + blue * blue) / Math.SQRT2;
  }
  return 1 - distance / 30;
}

function compactEdge(values: number[]): number[] {
  const output: number[] = [];
  for (let targetY = 0; targetY < 11; targetY += 1) {
    for (let targetX = 0; targetX < 8; targetX += 1) {
      const sourceX = Math.min(23, Math.floor(((targetX + 0.5) * 24) / 8));
      const sourceY = Math.min(33, Math.floor(((targetY + 0.5) * 34) / 11));
      output.push(values[sourceY * 24 + sourceX]);
    }
  }
  return output;
}

function compactEdgeSimilarity(left: number[], right: Uint8Array): number {
  if (left.length === 0 || right.length !== left.length) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / (right.length * 255);
  let product = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] - leftMean;
    const rightValue = right[index] / 255 - rightMean;
    product += leftValue * rightValue;
    leftSquares += leftValue * leftValue;
    rightSquares += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator > 0 ? Math.max(0, Math.min(1, (product / denominator + 1) / 2)) : 0;
}

function compactTitle(values: number[]): number[] {
  const output: number[] = [];
  for (let targetY = 0; targetY < 4; targetY += 1) {
    for (let targetX = 0; targetX < 20; targetX += 1) {
      const sourceX = Math.min(39, Math.floor(((targetX + 0.5) * 40) / 20));
      const sourceY = Math.min(7, Math.floor(((targetY + 0.5) * 8) / 4));
      output.push(values[sourceY * 40 + sourceX]);
    }
  }
  return output;
}

function compactArtworkEdge(values: number[]): number[] {
  const output: number[] = [];
  for (let targetY = 0; targetY < 12; targetY += 1) {
    for (let targetX = 0; targetX < 16; targetX += 1) {
      const sourceX = Math.min(31, Math.floor(((targetX + 0.5) * 32) / 16));
      const sourceY = Math.min(23, Math.floor(((targetY + 0.5) * 24) / 12));
      output.push(values[sourceY * 32 + sourceX]);
    }
  }
  return output;
}

function scoreRoute(
  signature: ImageSignature,
  compactSpatial: number[],
  compactEdges: number[],
  compactTitles: number[],
  compactArtworkEdges: number[],
  route: RuntimeRoute,
): number {
  const differenceScore = 1 - hammingDistance(signature.differenceHash, route[2]) / 64;
  const averageScore = 1 - hammingDistance(signature.averageHash, route[3]) / 64;
  const artworkScore = 1 - hammingDistance(signature.artworkHash, route[8]) / 64;
  const chromaScore = chromaSimilarity(signature.chromaVector, route[4]);
  const spatialScore = compactSpatialSimilarity(compactSpatial, route[5]);
  const edgeScore = compactEdgeSimilarity(compactEdges, route[6]);
  const titleScore = compactEdgeSimilarity(compactTitles, route[7]);
  const artworkEdgeScore = compactEdgeSimilarity(compactArtworkEdges, route[9]);
  return differenceScore * 0.02 + averageScore * 0.08 + chromaScore * 0.02 + spatialScore * 0.03 + edgeScore * 0.05 + titleScore * 0.2 + artworkScore * 0.25 + artworkEdgeScore * 0.35;
}

// Cheap prefilter score: only the three 64-bit hash distances + the 13-d chroma histogram,
// none of the expensive vector correlations. Used to trim ~110k routes down to a generous
// shortlist before the full scoreRoute runs.
function cheapRouteScore(signature: ImageSignature, route: RuntimeRoute): number {
  const differenceScore = 1 - hammingDistance(signature.differenceHash, route[2]) / 64;
  const averageScore = 1 - hammingDistance(signature.averageHash, route[3]) / 64;
  const artworkScore = 1 - hammingDistance(signature.artworkHash, route[8]) / 64;
  const chromaScore = chromaSimilarity(signature.chromaVector, route[4]);
  return differenceScore * 0.02 + averageScore * 0.08 + artworkScore * 0.25 + chromaScore * 0.02;
}

export function coarseRouteScore(signature: ImageSignature, route: RuntimeRoute): number {
  return scoreRoute(
    signature,
    compactSpatialColor(signature.spatialColorVector),
    compactEdge(signature.edgeVector),
    compactTitle(signature.titleVector),
    compactArtworkEdge(signature.artworkEdgeVector),
    route,
  );
}

function swap(heap: ScoredRoute[], left: number, right: number): void {
  [heap[left], heap[right]] = [heap[right], heap[left]];
}

function bubbleUp(heap: ScoredRoute[], start: number): void {
  let index = start;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].score <= heap[index].score) return;
    swap(heap, parent, index);
    index = parent;
  }
}

function bubbleDown(heap: ScoredRoute[], start: number): void {
  let index = start;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < heap.length && heap[left].score < heap[smallest].score) smallest = left;
    if (right < heap.length && heap[right].score < heap[smallest].score) smallest = right;
    if (smallest === index) return;
    swap(heap, index, smallest);
    index = smallest;
  }
}

export function selectCandidateRoutes(
  signature: ImageSignature,
  routes: RuntimeRoute[],
  count = ROUTE_SHORTLIST_SIZE,
): RuntimeRoute[] {
  const target = Math.min(count, routes.length);
  if (target === 0) return [];

  // Stage 1: cheap hash/chroma prefilter over ALL routes → a generous shortlist. This keeps
  // the true card (its hashes match well) while avoiding the expensive vector correlations on
  // the other ~104k routes.
  const prefilterSize = Math.min(routes.length, Math.max(target * 8, 6000));
  const cheapHeap: ScoredRoute[] = [];
  for (const route of routes) {
    const score = cheapRouteScore(signature, route);
    if (cheapHeap.length < prefilterSize) {
      cheapHeap.push({ route, score });
      bubbleUp(cheapHeap, cheapHeap.length - 1);
    } else if (score > cheapHeap[0].score) {
      cheapHeap[0] = { route, score };
      bubbleDown(cheapHeap, 0);
    }
  }

  // Stage 2: full scoreRoute only on the prefiltered routes.
  const heap: ScoredRoute[] = [];
  const compactSpatial = compactSpatialColor(signature.spatialColorVector);
  const compactEdges = compactEdge(signature.edgeVector);
  const compactTitles = compactTitle(signature.titleVector);
  const compactArtworkEdges = compactArtworkEdge(signature.artworkEdgeVector);
  for (const { route } of cheapHeap) {
    const score = scoreRoute(signature, compactSpatial, compactEdges, compactTitles, compactArtworkEdges, route);
    if (heap.length < target) {
      heap.push({ route, score });
      bubbleUp(heap, heap.length - 1);
    } else if (score > heap[0].score) {
      heap[0] = { route, score };
      bubbleDown(heap, 0);
    }
  }
  return heap.sort((left, right) => right.score - left.score).map(({ route }) => route);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Indexdatei nicht erreichbar: ${url}`);
  if (url.endsWith(".gz")) {
    // Vite and most static servers advertise Content-Encoding and the Fetch API
    // returns an already decompressed body. Plain file servers need the fallback.
    if (response.headers.get("content-encoding")?.includes("gzip")) {
      return response.json() as Promise<T>;
    }
    if (!response.body || typeof DecompressionStream === "undefined") {
      throw new Error("Dieser Browser kann den komprimierten Kartenindex nicht lesen.");
    }
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).json() as Promise<T>;
  }
  return response.json() as Promise<T>;
}

async function createRuntimeIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<RuntimeIndex> {
  const manifest = await fetchJson<Manifest>(`${INDEX_ROOT}/manifest.json`);
  if (manifest.formatVersion !== 1 || manifest.setCount !== manifest.sets.length) {
    throw new Error("Das All-Sets-Manifest ist ungültig.");
  }
  onProgress?.(0, manifest.cardCount);
  const routing = await fetchJson<RoutingPayload>(`${INDEX_ROOT}/${manifest.routingFile}`);
  if (
    routing.formatVersion !== 1 ||
    routing.indexVersion !== manifest.indexVersion ||
    routing.entries.length !== manifest.cardCount
  ) {
    throw new Error("Manifest und globales Kartenrouting passen nicht zusammen.");
  }
  const routes = routing.entries.map<RuntimeRoute>((entry) => [
    entry[0],
    entry[1],
    entry[2],
    entry[3],
    decodeBytes(entry[4]),
    decodeBytes(entry[5]),
    decodeBytes(entry[6]),
    decodeBytes(entry[7]),
    entry[8],
    decodeBytes(entry[9]),
  ]);
  onProgress?.(manifest.cardCount, manifest.cardCount);
  return { manifest, routes };
}

export async function loadAllCardIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<AllCardIndexSummary> {
  if (!pendingIndex) pendingIndex = createRuntimeIndex(onProgress);
  const { manifest } = await pendingIndex;
  return {
    cardCount: manifest.cardCount,
    totalCardCount: manifest.totalCardCount,
    setCount: manifest.setCount,
    complete: manifest.complete,
  };
}

async function loadShard(index: RuntimeIndex, setIndex: number): Promise<SerializedCard[]> {
  const existing = shardCache.get(setIndex);
  if (existing) return existing;
  const set = index.manifest.sets[setIndex];
  if (!set) throw new Error(`Unbekannter Set-Shard: ${setIndex}`);
  const request = fetchJson<{
    formatVersion: number;
    indexVersion: string;
    setCode: string;
    cardCount: number;
    cards: SerializedCard[];
  }>(`${INDEX_ROOT}/${set.file}`).then((payload) => {
    if (
      payload.formatVersion !== 1 ||
      payload.indexVersion !== index.manifest.indexVersion ||
      payload.setCode !== set.code ||
      payload.cardCount !== set.cardCount ||
      payload.cards.length !== set.cardCount
    ) throw new Error(`Ungültiger Karten-Shard: ${set.code}`);
    return payload.cards;
  });
  shardCache.set(setIndex, request);
  void request.catch(() => shardCache.delete(setIndex));
  return request;
}

async function loadCandidates(
  index: RuntimeIndex,
  routes: RuntimeRoute[],
  onProgress?: (done: number, total: number) => void,
): Promise<IndexedCard[]> {
  const positionsBySet = new Map<number, Set<number>>();
  for (const route of routes) {
    const positions = positionsBySet.get(route[0]) ?? new Set<number>();
    positions.add(route[1]);
    positionsBySet.set(route[0], positions);
  }
  const sets = [...positionsBySet.entries()];
  const candidates: IndexedCard[] = [];
  let cursor = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (cursor < sets.length) {
      const current = cursor;
      cursor += 1;
      const [setIndex, positions] = sets[current];
      const cards = await loadShard(index, setIndex);
      for (const position of positions) {
        const card = cards[position];
        if (card) candidates.push(decodeCard(card));
      }
      completed += 1;
      onProgress?.(completed, sets.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SHARD_CONCURRENCY, sets.length) }, () => worker()),
  );
  return candidates;
}

export async function findAllCardMatches(
  signatureOrSignatures: ImageSignature | ImageSignature[],
  limit = 3,
  onProgress?: (done: number, total: number) => void,
  printingSignatures?: ImageSignature[],
): Promise<MatchCandidate[]> {
  if (!pendingIndex) pendingIndex = createRuntimeIndex();
  const index = await pendingIndex;
  const signatures = Array.isArray(signatureOrSignatures) ? signatureOrSignatures : [signatureOrSignatures];
  const printSignatures = printingSignatures?.length ? printingSignatures : signatures;
  const routeKeys = new Set<string>();
  const routes: RuntimeRoute[] = [];
  for (const signature of signatures) {
    for (const route of selectCandidateRoutes(signature, index.routes)) {
      const key = `${route[0]}:${route[1]}`;
      if (!routeKeys.has(key)) {
        routeKeys.add(key);
        routes.push(route);
      }
    }
  }
  const candidates = await loadCandidates(index, routes, onProgress);
  const scoredCandidates = candidates.map((card) => {
    const scores = signatures.map((signature) => signatureSimilarityBreakdown(signature, card.signature));
    return {
      card,
      similarity: Math.max(...scores.map((score) => score.similarity)),
      focusedSimilarity: Math.max(...scores.map((score) => score.focusedSimilarity)),
    };
  });
  const visuallyRanked = scoredCandidates
    .sort((left, right) => right.similarity - left.similarity);
  const generalTop = visuallyRanked[0];
  const focusedTop = [...scoredCandidates].sort((left, right) => right.focusedSimilarity - left.focusedSimilarity)[0];
  const focusedIsCorroborated = Boolean(
    generalTop &&
    focusedTop &&
    focusedTop.focusedSimilarity >= generalTop.focusedSimilarity + 0.03 &&
    focusedTop.similarity >= generalTop.similarity - 0.025
  );
  const identifiedName = (focusedIsCorroborated ? focusedTop : generalTop)?.card.name;
  const bestPrinting = visuallyRanked
    .filter((match) => match.card.name === identifiedName)
    .map((match) => ({
      match,
      printingScore: Math.max(...printSignatures.map((signature) => printingSimilarity(signature, match.card.signature))),
    }))
    .sort((left, right) => right.printingScore - left.printingScore)[0];
  if (!bestPrinting) return [];
  const identityRanked = focusedIsCorroborated
    ? [...scoredCandidates].sort((left, right) => right.focusedSimilarity - left.focusedSimilarity)
    : visuallyRanked;
  const displayedSimilarity = (match: (typeof scoredCandidates)[number]) =>
    focusedIsCorroborated ? match.focusedSimilarity : match.similarity;
  return [
    {
      card: bestPrinting.match.card,
      similarity: Math.max(displayedSimilarity(bestPrinting.match), bestPrinting.printingScore),
    },
    ...identityRanked
      .filter((match) => match.card.id !== bestPrinting.match.card.id)
      .map((match) => ({ card: match.card, similarity: displayedSimilarity(match) })),
  ].slice(0, limit);
}

export type TitleMatchResult = {
  matches: MatchCandidate[];
  name: string | null;
  nameScore: number;
};

/**
 * Identify a card from an OCR'd title: fuzzy-match the text to a real card name, then load
 * only that name's printings and rank them by visual similarity to pick the exact printing.
 * The name fixes the identity (bypassing the perceptual route shortlist); the signatures only
 * disambiguate which printing it is.
 */
export async function findMatchesByTitle(
  ocrText: string,
  signatures: { identification: ImageSignature[]; printing: ImageSignature[] },
  limit = 3,
): Promise<TitleMatchResult> {
  const nameMatch = await matchCardName(ocrText);
  if (!nameMatch) return { matches: [], name: null, nameScore: 0 };
  if (!pendingIndex) pendingIndex = createRuntimeIndex();
  const index = await pendingIndex;

  const positionsBySet = new Map<number, number[]>();
  for (const [setIndex, position] of nameMatch.locations) {
    const positions = positionsBySet.get(setIndex) ?? [];
    positions.push(position);
    positionsBySet.set(setIndex, positions);
  }

  const cards: IndexedCard[] = [];
  for (const [setIndex, positions] of positionsBySet) {
    const shard = await loadShard(index, setIndex);
    for (const position of positions) {
      const card = shard[position];
      if (card) cards.push(decodeCard(card));
    }
  }

  // Printings that share (near-)identical artwork cannot be told apart visually, so we keep
  // only the first of each artwork group and don't split hairs over noise between them.
  const representatives: IndexedCard[] = [];
  for (const card of cards) {
    const sameArt = representatives.find(
      (rep) => hammingDistance(rep.signature.artworkHash, card.signature.artworkHash) <= ARTWORK_SAME_THRESHOLD,
    );
    if (!sameArt) representatives.push(card);
  }

  const scored = representatives
    .map((card) => ({
      card,
      similarity: Math.max(...signatures.identification.map((s) => signatureSimilarity(s, card.signature))),
    }))
    .sort((left, right) => right.similarity - left.similarity);

  return {
    matches: scored.slice(0, limit).map(({ card, similarity }) => ({ card, similarity })),
    name: nameMatch.name,
    nameScore: nameMatch.score,
  };
}

export async function diagnoseIndexedCard(
  signature: ImageSignature,
  setCode: string,
  collectorNumber: string,
): Promise<{
  routeRank: number;
  routeScore: number;
  similarity: number;
  breakdown: ReturnType<typeof signatureSimilarityBreakdown>;
} | null> {
  if (!pendingIndex) pendingIndex = createRuntimeIndex();
  const index = await pendingIndex;
  const setIndex = index.manifest.sets.findIndex((set) => set.code === setCode);
  if (setIndex < 0) return null;
  const cards = await loadShard(index, setIndex);
  const position = cards.findIndex((card) => card.collectorNumber === collectorNumber);
  if (position < 0) return null;
  const route = index.routes.find((candidate) => candidate[0] === setIndex && candidate[1] === position);
  if (!route) return null;
  const compactSpatial = compactSpatialColor(signature.spatialColorVector);
  const compactEdges = compactEdge(signature.edgeVector);
  const compactTitles = compactTitle(signature.titleVector);
  const compactArtworkEdges = compactArtworkEdge(signature.artworkEdgeVector);
  const routeScore = scoreRoute(signature, compactSpatial, compactEdges, compactTitles, compactArtworkEdges, route);
  const routeRank = 1 + index.routes.reduce(
    (count, candidate) => count + Number(
      scoreRoute(signature, compactSpatial, compactEdges, compactTitles, compactArtworkEdges, candidate) > routeScore,
    ),
    0,
  );
  const cardSignature = decodeCard(cards[position]).signature;
  return {
    routeRank,
    routeScore,
    similarity: signatureSimilarity(signature, cardSignature),
    breakdown: signatureSimilarityBreakdown(signature, cardSignature),
  };
}
