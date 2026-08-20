import {
    artworkSimilarity,
    fineRankScore,
    hammingDistance,
    printingSimilarity,
    signatureSimilarity,
    signatureSimilarityBreakdown,
} from "./image-hash";
import { deleteIndexFile, pruneIndexFiles, readIndexFile, writeIndexFile } from "./index-file-store";
import type { StoredIndexFile } from "./index-file-store";
import { matchCardName } from "./name-index";
import type { CardRecord, ImageSignature, IndexedCard, MatchCandidate } from "src/types";

const INDEX_ROOT = "/data/all-card-index";
const ROUTE_SHORTLIST_SIZE = 1200;
const SHARD_CONCURRENCY = 8;
// Max Hamming distance between two 64-bit artwork hashes to treat printings as the same art.
const ARTWORK_SAME_THRESHOLD = 4;

// Fixed per-route vector lengths, set by the index builder via the compact* projections below
// (compactEdge → 11×8, compactTitle → 4×20, compactArtworkEdge → 12×16). The compiled index
// packs every route's vectors back-to-back into one flat buffer per kind, so these must be exact.
const ROUTE_CHROMA_LENGTH = 13;
const ROUTE_SPATIAL_LENGTH = 90;
const ROUTE_EDGE_LENGTH = 88;
const ROUTE_TITLE_LENGTH = 80;
const ROUTE_ARTWORK_EDGE_LENGTH = 192;

/**
 * A card signature as stored in a set shard (vectors base64-packed)
 */
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

/**
 * A card record plus its packed signature, as stored in a set shard
 */
type SerializedCard = CardRecord & { signature: SerializedSignature };

/**
 * One set's entry in the index manifest
 */
type ManifestSet = {
    code: string;
    name: string;
    cardCount: number;
    file: string;
};

/**
 * The index manifest: which sets exist and where their shards live
 */
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

/**
 * A routing entry as stored on disk: card position plus its packed coarse vectors
 */
type SerializedRoute = [number, number, string, string, string, string, string, string, string, string];
/**
 * A routing entry with its vectors decoded into typed arrays
 */
export type RuntimeRoute = [
    number,
    number,
    string,
    string,
    Uint8Array,
    Uint8Array,
    Uint8Array,
    Uint8Array,
    string,
    Uint8Array,
];

/**
 * The routing file: one coarse entry per card in the whole index
 */
type RoutingPayload = {
    formatVersion: number;
    indexVersion: string;
    complete: boolean;
    entries: SerializedRoute[];
};

/**
 * The routing table compiled for scoring: struct-of-arrays over flat typed buffers instead of
 * ~110k tuples of separate `Uint8Array`s. Two things make this much faster than scoring the
 * tuples directly, both **bit-identical** to `scoreRoute` (same operations, same order):
 *
 *  - the 64-bit hashes are pre-split into `Uint32` halves, so the hot loop does two XOR+popcounts
 *    instead of `slice` + `parseInt` on hex strings (3 hashes × ~110k routes per scan);
 *  - the cosine terms' route-side mean and centred sum-of-squares are precomputed once at load,
 *    removing two of the three passes over every route vector on every scan.
 *
 * Packing the vectors back-to-back also turns ~660k small heap objects into 5 contiguous buffers,
 * which is what makes the scan loop cache-friendly.
 */
type CompiledRoutes = {
    count: number;
    setIndex: Int32Array;
    position: Int32Array;
    differenceHigh: Uint32Array;
    differenceLow: Uint32Array;
    averageHigh: Uint32Array;
    averageLow: Uint32Array;
    artworkHigh: Uint32Array;
    artworkLow: Uint32Array;
    chroma: Uint8Array;
    spatial: Uint8Array;
    edge: Uint8Array;
    edgeMean: Float64Array;
    edgeSumSquares: Float64Array;
    title: Uint8Array;
    titleMean: Float64Array;
    titleSumSquares: Float64Array;
    artworkEdge: Uint8Array;
    artworkEdgeMean: Float64Array;
    artworkEdgeSumSquares: Float64Array;
};

/**
 * The decoded index held in memory: manifest, routing table and the shard cache
 */
type RuntimeIndex = {
    manifest: Manifest;
    routes: CompiledRoutes;
};

/**
 * What the app needs to know about a loaded index
 */
export type AllCardIndexSummary = {
    cardCount: number;
    totalCardCount: number;
    setCount: number;
    complete: boolean;
    /** Every indexed set, so the UI can offer a per-release scan filter. */
    sets: Array<{ code: string; name: string; cardCount: number }>;
};

/**
 * A route with its coarse score, used inside the shortlist heap
 */
type ScoredRoute = { route: number; score: number };

let pendingIndex: Promise<RuntimeIndex> | null = null;
const shardCache = new Map<number, Promise<SerializedCard[]>>();
// Decoded cards keyed by "<setIndex>:<position>". `decodeCard` (atob + /255 across ~10 vectors) is
// a large per-candidate cost paid on every scan; caching the decoded form makes repeat candidates
// free, which is decisive for live scanning where consecutive frames of the same card produce
// almost the same shortlist. The decoded values are immutable, so sharing them is safe.
//
// Bounded, because a decoded card is ~24k doubles-worth of vectors (~190 KB) and a long live
// session touches far more distinct cards than a phone can hold. `Map` iterates in insertion
// order, so re-inserting on a hit turns it into a plain LRU: one full shortlist (1200) stays
// resident with room for a few scans' worth of churn around it.
const DECODED_CACHE_LIMIT = 4000;
const decodedCache = new Map<string, IndexedCard>();

/**
 * Caches a decoded card, evicting the oldest entry once the cache is full
 *
 * @param key
 * @param card
 */
function cacheDecodedCard(key: string, card: IndexedCard): void {
    decodedCache.set(key, card);
    while (decodedCache.size > DECODED_CACHE_LIMIT) {
        const oldest = decodedCache.keys().next();
        if (oldest.done) break;
        decodedCache.delete(oldest.value);
    }
}

/**
 * Decode one card of a loaded shard, serving (and refreshing) the LRU cache.
 *
 * @param setIndex
 * @param position
 * @param shard
 * @returns
 */
function decodeCachedCard(setIndex: number, position: number, shard: SerializedCard[]): IndexedCard | null {
    const key = `${setIndex}:${position}`;
    const cached = decodedCache.get(key);
    if (cached) {
        decodedCache.delete(key); // re-insert to mark as most recently used
        cacheDecodedCard(key, cached);
        return cached;
    }
    const card = shard[position];
    if (!card) return null;
    const decoded = decodeCard(card);
    cacheDecodedCard(key, decoded);
    return decoded;
}

/**
 * Timings (ms) and candidate count of the most recent `findAllCardMatches` call. Written on
 *  every scan and read by the benchmark harness; has no effect on matching.
 */
export const lastMatchProfile = { routeSelect: 0, load: 0, fineRank: 0, rank: 0, candidates: 0, printingScored: 0 };

/**
 * Decodes a base64 string into its bytes
 *
 * @param value
 * @returns
 */
function decodeBytes(value: string): Uint8Array {
    // `atob` is a global in both window and worker scopes; avoid `window` so this module
    // can run inside the scan worker. A plain loop into a preallocated buffer beats
    // `Uint8Array.from(binary, cb)` — this runs over millions of bytes per cold scan.
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

/**
 * Decodes a base64-packed vector back into numbers
 *
 * @param value
 * @returns
 */
function decodeVector(value: string): number[] {
    const binary = atob(value);
    const length = binary.length;
    const values = new Array<number>(length);
    for (let index = 0; index < length; index += 1) values[index] = binary.charCodeAt(index) / 255;
    return values;
}

/**
 * Define `property` as a getter that decodes its vector on first access and then caches it.
 *  The set-symbol, footer and stamp grids are only read by `printingSimilarity`, which runs on
 *  the handful of candidates sharing the identified card's name (a median of ~2 per scan) — but
 *  eagerly decoding them costs ~25% of every candidate's decode. Deferring them is invisible to
 *  callers: the property still reads as a plain `number[]`.
 *
 * @param signature
 * @param property
 * @param encoded
 */
function defineLazyVector(signature: ImageSignature, property: keyof ImageSignature, encoded: string): void {
    let decoded: number[] | null = null;
    Object.defineProperty(signature, property, {
        configurable: true,
        enumerable: true,
        /**
         * Decodes the card on first access and keeps the decoded value
         *
         * @returns
         */
        get() {
            if (!decoded) decoded = decodeVector(encoded);
            return decoded;
        },
    });
}

/**
 * Turns a shard entry into a card the matcher can score
 *
 * @param card
 * @returns
 */
function decodeCard(card: SerializedCard): IndexedCard {
    const signature = {
        differenceHash: card.signature.differenceHash,
        averageHash: card.signature.averageHash,
        artworkHash: card.signature.artworkHash,
        detailVector: decodeVector(card.signature.detailVector),
        artworkVector: decodeVector(card.signature.artworkVector),
        artworkEdgeVector: decodeVector(card.signature.artworkEdgeVector),
        spatialColorVector: decodeVector(card.signature.spatialColorVector),
        titleVector: decodeVector(card.signature.titleVector),
        chromaVector: decodeVector(card.signature.chromaVector),
        edgeVector: decodeVector(card.signature.edgeVector),
        colorVector: decodeVector(card.signature.colorVector),
        dominantColor: card.signature.dominantColor,
    } as ImageSignature;
    defineLazyVector(signature, "setSymbolVector", card.signature.setSymbolVector);
    defineLazyVector(signature, "footerVector", card.signature.footerVector);
    defineLazyVector(signature, "stampVector", card.signature.stampVector);
    return { ...card, signature };
}

/**
 * Cosine-style similarity of two chroma vectors, one of them packed
 *
 * @param left
 * @param right
 * @param offset
 * @returns
 */
function chromaSimilarity(left: number[], right: Uint8Array, offset: number): number {
    if (left.length !== ROUTE_CHROMA_LENGTH) return 0;
    let hueIntersection = 0;
    for (let index = 0; index < 12; index += 1) {
        hueIntersection += Math.min(left[index], right[offset + index] / 255);
    }
    const saturationScore = 1 - Math.min(1, Math.abs(left[12] - right[offset + 12] / 255) * 2);
    return hueIntersection * 0.8 + saturationScore * 0.2;
}

/**
 * Quantises a spatial-colour vector down to the routing table's byte resolution
 *
 * @param values
 * @returns
 */
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

/**
 * Similarity of two spatial-colour vectors, one of them packed
 *
 * @param left
 * @param right
 * @param offset
 * @returns
 */
function compactSpatialSimilarity(left: number[], right: Uint8Array, offset: number): number {
    if (left.length !== ROUTE_SPATIAL_LENGTH) return 0;
    let distance = 0;
    for (let index = 0; index < left.length; index += 3) {
        const red = left[index] - right[offset + index] / 255;
        const green = left[index + 1] - right[offset + index + 1] / 255;
        const blue = left[index + 2] - right[offset + index + 2] / 255;
        distance += Math.sqrt(red * red + green * green + blue * blue) / Math.SQRT2;
    }
    return 1 - distance / 30;
}

/**
 * Quantises an edge vector down to the routing table's byte resolution
 *
 * @param values
 * @returns
 */
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

/**
 * A query vector with its mean already subtracted, plus the centred sum of squares — the parts
 *  of the cosine similarity that depend only on the query and so are computed once per scan
 *  instead of once per route.
 */
type CenteredVector = { centered: Float64Array; sumSquares: number };

/**
 * Mean-centres a vector and precomputes its norm, so similarity is a dot product
 *
 * @param values
 * @returns
 */
function centeredStats(values: number[]): CenteredVector {
    const length = values.length;
    let mean = 0;
    for (let index = 0; index < length; index += 1) mean += values[index];
    mean /= length || 1;
    const centered = new Float64Array(length);
    let sumSquares = 0;
    for (let index = 0; index < length; index += 1) {
        const value = values[index] - mean;
        centered[index] = value;
        sumSquares += value * value;
    }
    return { centered, sumSquares };
}

/**
 * Route-side half of the same cosine: the mean and centred sum of squares of one route vector.
 *  Computed once when the index is compiled (see `compileRoutes`).
 *
 * @param data
 * @param offset
 * @param length
 * @returns
 */
function routeVectorStats(data: Uint8Array, offset: number, length: number): { mean: number; sumSquares: number } {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += data[offset + index];
    const mean = sum / (length * 255);
    let sumSquares = 0;
    for (let index = 0; index < length; index += 1) {
        const value = data[offset + index] / 255 - mean;
        sumSquares += value * value;
    }
    return { mean, sumSquares };
}

/**
 * Cosine similarity in [0,1] between a precomputed centred query vector and one route's slice of
 *  a packed buffer. Bit-identical to the original `compactEdgeSimilarity(left, right)`: the same
 *  products are accumulated in the same order, only the mean/sum-of-squares passes are hoisted.
 *
 * @param query
 * @param data
 * @param offset
 * @param length
 * @param rightMean
 * @param rightSumSquares
 * @returns
 */
function cosineSimilarity(
    query: CenteredVector,
    data: Uint8Array,
    offset: number,
    length: number,
    rightMean: number,
    rightSumSquares: number,
): number {
    if (query.centered.length !== length) return 0;
    const centered = query.centered;
    let product = 0;
    for (let index = 0; index < length; index += 1) {
        product += centered[index] * (data[offset + index] / 255 - rightMean);
    }
    const denominator = Math.sqrt(query.sumSquares * rightSumSquares);
    return denominator > 0 ? Math.max(0, Math.min(1, (product / denominator + 1) / 2)) : 0;
}

/**
 * Counts the set bits of a 32-bit word
 *
 * @param value
 * @returns
 */
function popcount32(value: number): number {
    let n = value - ((value >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * The high 32 bits of a hex-encoded hash
 *
 * @param hex
 * @returns
 */
function hashHigh(hex: string): number {
    return parseInt((hex.length === 16 ? hex : hex.padStart(16, "0")).slice(0, 8), 16) >>> 0;
}

/**
 * The low 32 bits of a hex-encoded hash
 *
 * @param hex
 * @returns
 */
function hashLow(hex: string): number {
    return parseInt((hex.length === 16 ? hex : hex.padStart(16, "0")).slice(8, 16), 16) >>> 0;
}

/**
 * Quantises a title-strip vector down to the routing table's byte resolution
 *
 * @param values
 * @returns
 */
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

/**
 * Quantises an artwork-edge vector down to the routing table's byte resolution
 *
 * @param values
 * @returns
 */
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

/**
 * Everything about the query that the route loop would otherwise recompute ~110k times: the
 *  compacted projections, their centred cosine statistics, and the hashes pre-split into 32-bit
 *  halves. Built once per scanned signature.
 */
type ScoreContext = {
    chromaVector: number[];
    spatial: number[];
    edge: CenteredVector;
    title: CenteredVector;
    artworkEdge: CenteredVector;
    differenceHigh: number;
    differenceLow: number;
    averageHigh: number;
    averageLow: number;
    artworkHigh: number;
    artworkLow: number;
};

/**
 * Precomputes everything the coarse score needs from the query signature
 *
 * @param signature
 * @returns
 */
function buildScoreContext(signature: ImageSignature): ScoreContext {
    return {
        chromaVector: signature.chromaVector,
        spatial: compactSpatialColor(signature.spatialColorVector),
        edge: centeredStats(compactEdge(signature.edgeVector)),
        title: centeredStats(compactTitle(signature.titleVector)),
        artworkEdge: centeredStats(compactArtworkEdge(signature.artworkEdgeVector)),
        differenceHigh: hashHigh(signature.differenceHash),
        differenceLow: hashLow(signature.differenceHash),
        averageHigh: hashHigh(signature.averageHash),
        averageLow: hashLow(signature.averageHash),
        artworkHigh: hashHigh(signature.artworkHash),
        artworkLow: hashLow(signature.artworkHash),
    };
}

/**
 * Score one compiled route. Bit-identical to the original tuple-based `scoreRoute`.
 *
 * @param context
 * @param routes
 * @param index
 * @returns
 */
function scoreRoute(context: ScoreContext, routes: CompiledRoutes, index: number): number {
    const differenceDistance =
        popcount32((context.differenceHigh ^ routes.differenceHigh[index]) >>> 0) +
        popcount32((context.differenceLow ^ routes.differenceLow[index]) >>> 0);
    const averageDistance =
        popcount32((context.averageHigh ^ routes.averageHigh[index]) >>> 0) +
        popcount32((context.averageLow ^ routes.averageLow[index]) >>> 0);
    const artworkDistance =
        popcount32((context.artworkHigh ^ routes.artworkHigh[index]) >>> 0) +
        popcount32((context.artworkLow ^ routes.artworkLow[index]) >>> 0);
    const differenceScore = 1 - differenceDistance / 64;
    const averageScore = 1 - averageDistance / 64;
    const artworkScore = 1 - artworkDistance / 64;
    const chromaScore = chromaSimilarity(context.chromaVector, routes.chroma, index * ROUTE_CHROMA_LENGTH);
    const spatialScore = compactSpatialSimilarity(context.spatial, routes.spatial, index * ROUTE_SPATIAL_LENGTH);
    const edgeScore = cosineSimilarity(
        context.edge,
        routes.edge,
        index * ROUTE_EDGE_LENGTH,
        ROUTE_EDGE_LENGTH,
        routes.edgeMean[index],
        routes.edgeSumSquares[index],
    );
    const titleScore = cosineSimilarity(
        context.title,
        routes.title,
        index * ROUTE_TITLE_LENGTH,
        ROUTE_TITLE_LENGTH,
        routes.titleMean[index],
        routes.titleSumSquares[index],
    );
    const artworkEdgeScore = cosineSimilarity(
        context.artworkEdge,
        routes.artworkEdge,
        index * ROUTE_ARTWORK_EDGE_LENGTH,
        ROUTE_ARTWORK_EDGE_LENGTH,
        routes.artworkEdgeMean[index],
        routes.artworkEdgeSumSquares[index],
    );
    return (
        differenceScore * 0.02 +
        averageScore * 0.08 +
        chromaScore * 0.02 +
        spatialScore * 0.03 +
        edgeScore * 0.05 +
        titleScore * 0.2 +
        artworkScore * 0.25 +
        artworkEdgeScore * 0.35
    );
}

/**
 * Allocates the flat typed arrays that hold the compiled routing table
 *
 * @param count
 * @returns
 */
function allocateRoutes(count: number): CompiledRoutes {
    return {
        count,
        setIndex: new Int32Array(count),
        position: new Int32Array(count),
        differenceHigh: new Uint32Array(count),
        differenceLow: new Uint32Array(count),
        averageHigh: new Uint32Array(count),
        averageLow: new Uint32Array(count),
        artworkHigh: new Uint32Array(count),
        artworkLow: new Uint32Array(count),
        chroma: new Uint8Array(count * ROUTE_CHROMA_LENGTH),
        spatial: new Uint8Array(count * ROUTE_SPATIAL_LENGTH),
        edge: new Uint8Array(count * ROUTE_EDGE_LENGTH),
        edgeMean: new Float64Array(count),
        edgeSumSquares: new Float64Array(count),
        title: new Uint8Array(count * ROUTE_TITLE_LENGTH),
        titleMean: new Float64Array(count),
        titleSumSquares: new Float64Array(count),
        artworkEdge: new Uint8Array(count * ROUTE_ARTWORK_EDGE_LENGTH),
        artworkEdgeMean: new Float64Array(count),
        artworkEdgeSumSquares: new Float64Array(count),
    };
}

/**
 * Write one route into the packed buffers and derive its cosine statistics. The vector arguments
 *  are transient — nothing keeps a reference to them after this returns, which is what lets the
 *  index be compiled entry-by-entry instead of materialising ~110k tuples first.
 *
 * @param routes
 * @param index
 * @param setIndex
 * @param position
 * @param differenceHash
 * @param averageHash
 * @param artworkHash
 * @param chroma
 * @param spatial
 * @param edge
 * @param title
 * @param artworkEdge
 */
function writeRoute(
    routes: CompiledRoutes,
    index: number,
    setIndex: number,
    position: number,
    differenceHash: string,
    averageHash: string,
    artworkHash: string,
    chroma: Uint8Array,
    spatial: Uint8Array,
    edge: Uint8Array,
    title: Uint8Array,
    artworkEdge: Uint8Array,
): void {
    if (
        chroma.length !== ROUTE_CHROMA_LENGTH ||
        spatial.length !== ROUTE_SPATIAL_LENGTH ||
        edge.length !== ROUTE_EDGE_LENGTH ||
        title.length !== ROUTE_TITLE_LENGTH ||
        artworkEdge.length !== ROUTE_ARTWORK_EDGE_LENGTH
    ) {
        throw new Error("Das Kartenrouting hat unerwartete Vektorlängen — bitte den Index neu bauen.");
    }
    routes.setIndex[index] = setIndex;
    routes.position[index] = position;
    routes.differenceHigh[index] = hashHigh(differenceHash);
    routes.differenceLow[index] = hashLow(differenceHash);
    routes.averageHigh[index] = hashHigh(averageHash);
    routes.averageLow[index] = hashLow(averageHash);
    routes.artworkHigh[index] = hashHigh(artworkHash);
    routes.artworkLow[index] = hashLow(artworkHash);

    const edgeOffset = index * ROUTE_EDGE_LENGTH;
    const titleOffset = index * ROUTE_TITLE_LENGTH;
    const artworkEdgeOffset = index * ROUTE_ARTWORK_EDGE_LENGTH;
    routes.chroma.set(chroma, index * ROUTE_CHROMA_LENGTH);
    routes.spatial.set(spatial, index * ROUTE_SPATIAL_LENGTH);
    routes.edge.set(edge, edgeOffset);
    routes.title.set(title, titleOffset);
    routes.artworkEdge.set(artworkEdge, artworkEdgeOffset);

    const edgeStats = routeVectorStats(routes.edge, edgeOffset, ROUTE_EDGE_LENGTH);
    routes.edgeMean[index] = edgeStats.mean;
    routes.edgeSumSquares[index] = edgeStats.sumSquares;
    const titleStats = routeVectorStats(routes.title, titleOffset, ROUTE_TITLE_LENGTH);
    routes.titleMean[index] = titleStats.mean;
    routes.titleSumSquares[index] = titleStats.sumSquares;
    const artworkEdgeStats = routeVectorStats(routes.artworkEdge, artworkEdgeOffset, ROUTE_ARTWORK_EDGE_LENGTH);
    routes.artworkEdgeMean[index] = artworkEdgeStats.mean;
    routes.artworkEdgeSumSquares[index] = artworkEdgeStats.sumSquares;
}

/**
 * Pack tuple routes into the flat, statistics-annotated form the scan loop consumes.
 *
 * @param entries
 * @returns
 */
function compileRoutes(entries: RuntimeRoute[]): CompiledRoutes {
    const routes = allocateRoutes(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        writeRoute(
            routes,
            index,
            entry[0],
            entry[1],
            entry[2],
            entry[3],
            entry[8],
            entry[4],
            entry[5],
            entry[6],
            entry[7],
            entry[9],
        );
    }
    return routes;
}

/**
 * Scores one routing entry against a query signature (the shortlist stage)
 *
 * @param signature
 * @param route
 * @returns the coarse score, higher is closer
 */
export function coarseRouteScore(signature: ImageSignature, route: RuntimeRoute): number {
    return scoreRoute(buildScoreContext(signature), compileRoutes([route]), 0);
}

/**
 * Swaps two heap entries
 *
 * @param heap
 * @param left
 * @param right
 */
function swap(heap: ScoredRoute[], left: number, right: number): void {
    [heap[left], heap[right]] = [heap[right], heap[left]];
}

/**
 * Restores the heap invariant upwards from a freshly inserted entry
 *
 * @param heap
 * @param start
 */
function bubbleUp(heap: ScoredRoute[], start: number): void {
    let index = start;
    while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (heap[parent].score <= heap[index].score) return;
        swap(heap, parent, index);
        index = parent;
    }
}

/**
 * Restores the heap invariant downwards from the root
 *
 * @param heap
 * @param start
 */
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

/**
 * Tuple-based entry point (kept for the unit test and `coarseRouteScore`'s callers): compiles
 *  the given routes and runs the same selection the scanner uses.
 */
export function selectCandidateRoutes(
    signature: ImageSignature,
    routes: RuntimeRoute[],
    count = ROUTE_SHORTLIST_SIZE,
): RuntimeRoute[] {
    return selectScoredRoutes(signature, compileRoutes(routes), count).map(({ route }) => routes[route]);
}

/**
 * Score every route (full scoreRoute) and keep the top `count`. Kept single-stage for
 * accuracy: a cheap prefilter risks dropping a borderline true card, which matters because
 * the runtime input (worker ImageBitmap) differs subtly from the regression's <img> and can
 * sit right at the margin. The compiled route layout — precomputed hash halves and cosine
 * statistics — is what keeps an exhaustive pass over all ~110k routes affordable.
 *
 * @param signature
 * @param routes
 * @param count
 * @param allowedSets
 * @returns
 */
function selectScoredRoutes(
    signature: ImageSignature,
    routes: CompiledRoutes,
    count = ROUTE_SHORTLIST_SIZE,
    allowedSets?: Set<number> | null,
): ScoredRoute[] {
    const target = Math.min(count, routes.count);
    if (target === 0) return [];
    const heap: ScoredRoute[] = [];
    const context = buildScoreContext(signature);
    for (let route = 0; route < routes.count; route += 1) {
        if (allowedSets && !allowedSets.has(routes.setIndex[route])) continue;
        const score = scoreRoute(context, routes, route);
        if (heap.length < target) {
            heap.push({ route, score });
            bubbleUp(heap, heap.length - 1);
        } else if (score > heap[0].score) {
            heap[0] = { route, score };
            bubbleDown(heap, 0);
        }
    }
    return heap.sort((left, right) => right.score - left.score);
}

/**
 * Fetches an index file as the bytes the server sent
 *
 * @param url
 * @returns the bytes, flagged when they still need gunzipping
 */
async function fetchIndexBytes(url: string): Promise<StoredIndexFile> {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Indexdatei nicht erreichbar: ${url}`);
    // Vite and most static servers advertise Content-Encoding and the Fetch API returns an
    // already decompressed body; plain file servers hand the .gz bytes through untouched.
    const compressed = url.endsWith(".gz") && !response.headers.get("content-encoding")?.includes("gzip");
    return { bytes: await response.arrayBuffer(), compressed };
}

/**
 * Parses a stored or fetched index file
 *
 * @param file
 * @returns
 */
async function parseIndexFile<T>(file: StoredIndexFile): Promise<T> {
    if (!file.compressed) return JSON.parse(new TextDecoder().decode(file.bytes)) as T;
    if (typeof DecompressionStream === "undefined") {
        throw new Error("Dieser Browser kann den komprimierten Kartenindex nicht lesen.");
    }
    const stream = new Blob([file.bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).json() as Promise<T>;
}

/**
 * Loads one index file, preferring the persistent browser copy over the network.
 *
 * Files are content-addressed by the index version, so a cached copy is always valid; a version
 * change misses the cache, downloads fresh and leaves the pruning to the manifest load.
 *
 * @param path the file below {@link INDEX_ROOT}
 * @param indexVersion the version the file must belong to, or `null` to skip the cache
 * @returns the parsed file
 */
async function loadIndexFile<T>(path: string, indexVersion: string | null): Promise<T> {
    const key = indexVersion === null ? null : `${indexVersion}:${path}`;
    if (key) {
        const cached = await readIndexFile(key);
        if (cached) {
            try {
                return await parseIndexFile<T>(cached);
            } catch {
                await deleteIndexFile(key); // a corrupt entry heals itself on the next load
            }
        }
    }
    const file = await fetchIndexBytes(`${INDEX_ROOT}/${path}`);
    const parsed = await parseIndexFile<T>(file);
    if (key) void writeIndexFile(key, file);
    return parsed;
}

/**
 * Downloads manifest and routing table and compiles them into the in-memory index
 *
 * @param onProgress
 * @returns
 */
async function createRuntimeIndex(onProgress?: (done: number, total: number) => void): Promise<RuntimeIndex> {
    // The manifest is the freshness signal, so it is network-first — with the stored copy as the
    // offline fallback, which is what lets a fully cached index scan without any connection.
    let manifest: Manifest;
    try {
        const file = await fetchIndexBytes(`${INDEX_ROOT}/manifest.json`);
        manifest = await parseIndexFile<Manifest>(file);
        void writeIndexFile("manifest", file);
    } catch (error) {
        const cached = await readIndexFile("manifest");
        if (!cached) throw error;
        manifest = await parseIndexFile<Manifest>(cached);
    }
    if (manifest.formatVersion !== 1 || manifest.setCount !== manifest.sets.length) {
        throw new Error("Das All-Sets-Manifest ist ungültig.");
    }
    // An index refresh must not leave the previous version's files stranded in the quota.
    void pruneIndexFiles({ exact: ["manifest"], prefix: `${manifest.indexVersion}:` });
    onProgress?.(0, manifest.cardCount);
    const routing = await loadIndexFile<RoutingPayload>(manifest.routingFile, manifest.indexVersion);
    if (
        routing.formatVersion !== 1 ||
        routing.indexVersion !== manifest.indexVersion ||
        routing.entries.length !== manifest.cardCount
    ) {
        throw new Error("Manifest und globales Kartenrouting passen nicht zusammen.");
    }
    // Compile entry-by-entry straight into the packed buffers: each entry's decoded vectors are
    // transient, so the intermediate per-route arrays never all exist at once — only the compiled
    // index does. With ~110k routes that avoids roughly doubling peak memory during load.
    const routes = allocateRoutes(routing.entries.length);
    for (let index = 0; index < routing.entries.length; index += 1) {
        const entry = routing.entries[index];
        writeRoute(
            routes,
            index,
            entry[0],
            entry[1],
            entry[2],
            entry[3],
            entry[8],
            decodeBytes(entry[4]),
            decodeBytes(entry[5]),
            decodeBytes(entry[6]),
            decodeBytes(entry[7]),
            decodeBytes(entry[9]),
        );
    }
    onProgress?.(manifest.cardCount, manifest.cardCount);
    return { manifest, routes };
}

/**
 * Loads the all-card index once and returns what the app needs to know about it
 */
export async function loadAllCardIndex(
    onProgress?: (done: number, total: number) => void,
): Promise<AllCardIndexSummary> {
    if (!pendingIndex) pendingIndex = createRuntimeIndex(onProgress);
    const index = await pendingIndex;
    if (!prefetchStarted) {
        prefetchStarted = true;
        void prefetchAllShards(index);
    }
    const { manifest } = index;
    return {
        cardCount: manifest.cardCount,
        totalCardCount: manifest.totalCardCount,
        setCount: manifest.setCount,
        complete: manifest.complete,
        sets: manifest.sets.map(({ code, name, cardCount }) => ({ code, name, cardCount })),
    };
}

// After the index is ready, warm the shard cache in the background so the first scan of a
// fresh card doesn't pay the lazy fetch/gunzip/parse (which dominates a cold scan). Low
// concurrency + a yield between shards keeps active scans responsive; loadShard dedupes with
// any on-demand load. Note: this holds all ~110k cards' parsed shards in memory.
let prefetchStarted = false;
/**
 * Warms every set shard in the background, so later lookups do not wait on the network
 *
 * @param index
 */
async function prefetchAllShards(index: RuntimeIndex): Promise<void> {
    const concurrency = 3;
    let cursor = 0;
    /**
     * Loads shards until the queue is empty
     */
    async function worker(): Promise<void> {
        while (cursor < index.manifest.sets.length) {
            const setIndex = cursor;
            cursor += 1;
            if (!shardCache.has(setIndex)) {
                try {
                    await loadShard(index, setIndex);
                } catch {
                    // A failed prefetch is harmless; the shard is retried on demand.
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 15));
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

/**
 * Loads one set's shard, reusing the in-flight request if it is already being fetched
 *
 * @param index
 * @param setIndex
 * @returns
 */
async function loadShard(index: RuntimeIndex, setIndex: number): Promise<SerializedCard[]> {
    const existing = shardCache.get(setIndex);
    if (existing) return existing;
    const set = index.manifest.sets[setIndex];
    if (!set) throw new Error(`Unbekannter Set-Shard: ${setIndex}`);
    const request = loadIndexFile<{
        formatVersion: number;
        indexVersion: string;
        setCode: string;
        cardCount: number;
        cards: SerializedCard[];
    }>(set.file, index.manifest.indexVersion).then((payload) => {
        if (
            payload.formatVersion !== 1 ||
            payload.indexVersion !== index.manifest.indexVersion ||
            payload.setCode !== set.code ||
            payload.cardCount !== set.cardCount ||
            payload.cards.length !== set.cardCount
        ) {
            // Self-heal: never leave an invalid file in the persistent store.
            void deleteIndexFile(`${index.manifest.indexVersion}:${set.file}`);
            throw new Error(`Ungültiger Karten-Shard: ${set.code}`);
        }
        return payload.cards;
    });
    shardCache.set(setIndex, request);
    void request.catch(() => shardCache.delete(setIndex));
    return request;
}

/**
 * Loads the shards the shortlisted routes point into
 *
 * @param index
 * @param routes
 * @param onProgress
 * @returns
 */
async function loadCandidates(
    index: RuntimeIndex,
    routes: number[],
    onProgress?: (done: number, total: number) => void,
): Promise<IndexedCard[]> {
    const positionsBySet = new Map<number, Set<number>>();
    for (const route of routes) {
        const setIndex = index.routes.setIndex[route];
        const positions = positionsBySet.get(setIndex) ?? new Set<number>();
        positions.add(index.routes.position[route]);
        positionsBySet.set(setIndex, positions);
    }
    const sets = [...positionsBySet.entries()];
    const candidates: IndexedCard[] = [];
    let cursor = 0;
    let completed = 0;

    /**
     * Loads shards until the queue is empty
     */
    async function worker(): Promise<void> {
        while (cursor < sets.length) {
            const current = cursor;
            cursor += 1;
            const [setIndex, positions] = sets[current];
            const cards = await loadShard(index, setIndex);
            for (const position of positions) {
                const decoded = decodeCachedCard(setIndex, position, cards);
                if (decoded) candidates.push(decoded);
            }
            completed += 1;
            onProgress?.(completed, sets.length);
        }
    }

    await Promise.all(Array.from({ length: Math.min(SHARD_CONCURRENCY, sets.length) }, () => worker()));
    return candidates;
}

/**
 * Translate set codes into the index's set positions. Unknown codes are ignored; `null` (or an
 *  empty selection) means "no filter", which is what the All-Sets mode passes.
 *
 * @param setCodes
 * @returns the shard indices the filter allows, or null for every set
 */
export async function resolveSetFilter(setCodes: string[] | null | undefined): Promise<Set<number> | null> {
    if (!setCodes || setCodes.length === 0) return null;
    if (!pendingIndex) pendingIndex = createRuntimeIndex();
    const index = await pendingIndex;
    const wanted = new Set(setCodes.map((code) => code.toUpperCase()));
    const allowed = new Set<number>();
    index.manifest.sets.forEach((set, setIndex) => {
        if (wanted.has(set.code.toUpperCase())) allowed.add(setIndex);
    });
    return allowed.size > 0 ? allowed : null;
}

/**
 * Matches a query signature against the whole index: shortlist by routing, then rank the candidates
 *
 * @param signatureOrSignatures
 * @param limit
 * @param onProgress
 * @param printingSignatures
 * @param shortlistSize
 * @param allowedSets
 * @returns the ranked candidates, best first
 */
export async function findAllCardMatches(
    signatureOrSignatures: ImageSignature | ImageSignature[],
    limit = 3,
    onProgress?: (done: number, total: number) => void,
    printingSignatures?: ImageSignature[],
    shortlistSize = ROUTE_SHORTLIST_SIZE,
    allowedSets?: Set<number> | null,
): Promise<MatchCandidate[]> {
    if (!pendingIndex) pendingIndex = createRuntimeIndex();
    const index = await pendingIndex;
    const signatures = Array.isArray(signatureOrSignatures) ? signatureOrSignatures : [signatureOrSignatures];
    const printSignatures = printingSignatures?.length ? printingSignatures : signatures;
    // Route selection must run per variant: hard photos surface the true card only via a
    // non-primary (perspective/expanded) crop, so unioning every variant's shortlist is required
    // for recall. All variants are also used in fine-ranking below. A smaller `shortlistSize`
    // (live fast path) trims the fine-ranking cost; the default keeps still-photo recall unchanged.
    const profileStart = performance.now();
    const routeKeys = new Set<number>();
    const routes: number[] = [];
    for (const signature of signatures) {
        for (const { route } of selectScoredRoutes(signature, index.routes, shortlistSize, allowedSets)) {
            if (!routeKeys.has(route)) {
                routeKeys.add(route);
                routes.push(route);
            }
        }
    }
    const profileSelected = performance.now();
    const candidates = await loadCandidates(index, routes, onProgress);
    const profileLoaded = performance.now();
    const scoredCandidates = candidates.map((card) => {
        const scores = signatures.map((signature) => fineRankScore(signature, card.signature));
        return {
            card,
            similarity: Math.max(...scores.map((score) => score.similarity)),
            focusedSimilarity: Math.max(...scores.map((score) => score.focusedSimilarity)),
        };
    });
    lastMatchProfile.routeSelect = profileSelected - profileStart;
    lastMatchProfile.load = profileLoaded - profileSelected;
    lastMatchProfile.fineRank = performance.now() - profileLoaded;
    lastMatchProfile.candidates = candidates.length;
    const rankStart = performance.now();
    const visuallyRanked = scoredCandidates.sort((left, right) => right.similarity - left.similarity);
    const generalTop = visuallyRanked[0];
    const focusedTop = [...scoredCandidates].sort((left, right) => right.focusedSimilarity - left.focusedSimilarity)[0];
    const focusedIsCorroborated = Boolean(
        generalTop &&
        focusedTop &&
        focusedTop.focusedSimilarity >= generalTop.focusedSimilarity + 0.03 &&
        focusedTop.similarity >= generalTop.similarity - 0.025,
    );
    const identifiedName = (focusedIsCorroborated ? focusedTop : generalTop)?.card.name;
    const printingPool = visuallyRanked.filter((match) => match.card.name === identifiedName);
    lastMatchProfile.printingScored = printingPool.length;
    const bestPrinting = printingPool
        .map((match) => ({
            match,
            printingScore: Math.max(
                ...printSignatures.map((signature) => printingSimilarity(signature, match.card.signature)),
            ),
        }))
        .sort((left, right) => right.printingScore - left.printingScore)[0];
    lastMatchProfile.rank = performance.now() - rankStart;
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

/**
 * The printings found for a recognised card name, with the name's own score
 */
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
    allowedSets?: Set<number> | null,
): Promise<TitleMatchResult> {
    const nameMatch = await matchCardName(ocrText);
    if (!nameMatch) return { matches: [], name: null, nameScore: 0 };
    if (!pendingIndex) pendingIndex = createRuntimeIndex();
    const index = await pendingIndex;

    const positionsBySet = new Map<number, number[]>();
    for (const [setIndex, position] of nameMatch.locations) {
        if (allowedSets && !allowedSets.has(setIndex)) continue;
        const positions = positionsBySet.get(setIndex) ?? [];
        positions.push(position);
        positionsBySet.set(setIndex, positions);
    }
    // The name matched a real card, but no printing of it is inside the chosen sets.
    if (positionsBySet.size === 0) return { matches: [], name: nameMatch.name, nameScore: 0 };

    const cards: IndexedCard[] = [];
    for (const [setIndex, positions] of positionsBySet) {
        const shard = await loadShard(index, setIndex);
        for (const position of positions) {
            const card = decodeCachedCard(setIndex, position, shard);
            if (card) cards.push(card);
        }
    }

    // The name has fixed the card; what is left is picking the printing. Group printings by
    // artwork — printings sharing art cannot be told apart by the artwork signal, so they compete
    // as one — then let each group be represented by its member that best matches the
    // **print-specific** regions (set symbol, footer, The-List stamp). Groups are ranked by visual
    // similarity, as before.
    //
    // Choosing the representative used to be "whichever came first in the shard", which silently
    // decided the printing by index order: Shadowspear has three LTC printings with near-identical
    // artwork hashes, so the borderless one the user actually held could never win. Ranking the
    // whole pool by the print regions instead is not an option either — unlike in
    // `findAllCardMatches` this pool was never filtered by the route shortlist, so the print
    // regions alone happily pick a visually absurd printing.
    const groups: Array<{ cards: IndexedCard[]; artworkHash: string }> = [];
    for (const card of cards) {
        const group = groups.find(
            (candidate) => hammingDistance(candidate.artworkHash, card.signature.artworkHash) <= ARTWORK_SAME_THRESHOLD,
        );
        if (group) group.cards.push(card);
        else groups.push({ cards: [card], artworkHash: card.signature.artworkHash });
    }

    // Ranked by ARTWORK, not by overall similarity: the name is already settled, so the title,
    // frame and type line are identical across these candidates and only dilute the comparison.
    const scored = groups
        .map(({ cards: members }) => {
            const card =
                members.length === 1
                    ? members[0]
                    : members
                          .map((member) => ({
                              member,
                              printingScore: Math.max(
                                  ...signatures.printing.map((s) => printingSimilarity(s, member.signature)),
                              ),
                          }))
                          .sort((left, right) => right.printingScore - left.printingScore)[0].member;
            return {
                card,
                similarity: Math.max(...signatures.identification.map((s) => artworkSimilarity(s, card.signature))),
            };
        })
        .sort((left, right) => right.similarity - left.similarity);

    return {
        matches: scored.slice(0, limit).map(({ card, similarity }) => ({ card, similarity })),
        name: nameMatch.name,
        nameScore: nameMatch.score,
    };
}

/**
 * Every printing of a card, for correcting a scan by hand.
 *
 * Deliberately signature-free: the caller only renders these, and the signatures are by far the
 * largest part of a decoded card — shipping them across the worker boundary for a list of 40
 * printings costs far more than the lookup itself.
 *
 * @param name
 * @param allowedSets
 * @returns every printing of that card the index knows
 */
export async function listPrintingsByName(name: string, allowedSets?: Set<number> | null): Promise<CardRecord[]> {
    const nameMatch = await matchCardName(name);
    if (!nameMatch) return [];
    if (!pendingIndex) pendingIndex = createRuntimeIndex();
    const index = await pendingIndex;

    const positionsBySet = new Map<number, number[]>();
    for (const [setIndex, position] of nameMatch.locations) {
        if (allowedSets && !allowedSets.has(setIndex)) continue;
        const positions = positionsBySet.get(setIndex) ?? [];
        positions.push(position);
        positionsBySet.set(setIndex, positions);
    }

    const printings: CardRecord[] = [];
    for (const [setIndex, positions] of positionsBySet) {
        const shard = await loadShard(index, setIndex);
        for (const position of positions) {
            const card = decodeCachedCard(setIndex, position, shard);
            if (!card) continue;
            const { signature: _signature, ...record } = card;
            printings.push(record);
        }
    }

    // Grouped by set so printings of the same release stay together, and numerically within it —
    // collector numbers are strings ("12", "353a"), so a plain sort would put "100" before "20".
    return printings.sort((left, right) =>
        left.setCode === right.setCode
            ? collectorOrder(left.collectorNumber) - collectorOrder(right.collectorNumber)
            : left.setCode.localeCompare(right.setCode),
    );
}

/**
 * Sort key for a collector number, so numeric parts order numerically
 *
 * @param collectorNumber
 * @returns
 */
function collectorOrder(collectorNumber: string): number {
    return Number.parseInt(collectorNumber, 10) || 0;
}

/**
 * Scores one known card against a query signature — a debugging aid for the regression harness
 *
 * @param signature
 * @param setCode
 * @param collectorNumber
 * @returns the card's score against the query, or null if it is not in the index
 */
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
    const routes = index.routes;
    let route = -1;
    for (let candidate = 0; candidate < routes.count; candidate += 1) {
        if (routes.setIndex[candidate] === setIndex && routes.position[candidate] === position) {
            route = candidate;
            break;
        }
    }
    if (route < 0) return null;
    const context = buildScoreContext(signature);
    const routeScore = scoreRoute(context, routes, route);
    let routeRank = 1;
    for (let candidate = 0; candidate < routes.count; candidate += 1) {
        if (scoreRoute(context, routes, candidate) > routeScore) routeRank += 1;
    }
    const cardSignature = decodeCard(cards[position]).signature;
    return {
        routeRank,
        routeScore,
        similarity: signatureSimilarity(signature, cardSignature),
        breakdown: signatureSimilarityBreakdown(signature, cardSignature),
    };
}
