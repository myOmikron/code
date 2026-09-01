//! The whole recognition chain, from a camera frame to an answer or a refusal.
//!
//! Detection proposes card-shaped quads, the embedding narrows 111k printings to a shortlist,
//! local features decide among them, and a difference mask settles printings that are the same
//! picture. Each stage exists because the one before it cannot do that stage's job: shape cannot
//! tell a card from its illustration box, a single vector cannot tell two printings of one card
//! apart, and feature matching cannot see a stamp of eleven pixels without being aligned first.
import { detectCardsIn, rectifyCardIn, shrinkQuad } from "./card-detect";
import type { CardQuad, RgbaImage } from "./card-detect";
import { createEmbeddingIndex } from "./embedding-index";
import type { EmbeddingIndex, IndexManifest, IndexMatch } from "./embedding-index";
import type { Embedder } from "./embedder";
import { describeCard, discriminatePrintings, verifyAgainst } from "./feature-verify";
import type { CardFeatures } from "./feature-verify";
import { loadReferenceImage } from "./reference-images";
import { decideScan } from "./scan-decision";
import type { ScanOutcome } from "./scan-decision";

/** Where the packed index is served from. */
const INDEX_ROOT = "/data/scan-index";
/** Trim fractions tried per quad: none for a bare card, a little for a sleeved one. */
const INSETS = [0, 0.04];
/** Quads examined per frame, best-scoring first. */
const MAX_QUADS = 2;
/** How many printings the embedding shortlists for verification. */
const SHORTLIST = 20;
/** How many rectified crops are described and matched against every candidate. */
const VERIFY_CROPS = 2;
/** Share of the best inlier count within which candidates count as tied. */
const TIE_RATIO = 0.95;
/** Below this, a tie is not worth resolving because neither candidate is convincing. */
const MIN_TIE_INLIERS = 40;

/**
 * A loaded index, ready to search
 */
export type LoadedIndex = EmbeddingIndex & { manifest: IndexManifest };

/**
 * Everything a scan produced, for diagnostics and for the overlay
 */
export type ScanReport = {
    outcome: ScanOutcome;
    /** The quad the answer came from, in frame coordinates, if any */
    quad: CardQuad | null;
    /** Per-stage milliseconds, so a slow device can be diagnosed rather than guessed at */
    timings: { detect: number; embed: number; search: number; verify: number; total: number };
    /** How many printings were verified against */
    verified: number;
};

/**
 * Which file the loader is working on
 */
export type ScanLoadStage = "manifest" | "projection" | "vectors" | "cards" | "model";

/**
 * How far the load has got.
 *
 * Bytes rather than a sentence per file, because the point of showing this at all is that someone
 * agreed to a download whose size they were told, and a bar that fills is the only honest answer
 * to how much is left. The model has no byte count of its own, since the runtime fetches it
 * internally, so that stage carries a label instead.
 */
export type ScanLoadProgress = {
    stage: ScanLoadStage;
    /** Bytes of the index fetched so far */
    loaded: number;
    /** Bytes of the index expected in total, from the manifest */
    total: number;
    /** Extra detail for stages that have no byte count */
    detail: string;
};

/**
 * Fetches a file, reporting each chunk as it arrives.
 *
 * @param url
 * @param onChunk receives the size of every chunk
 * @returns the whole body
 */
async function fetchCounted(url: string, onChunk: (bytes: number) => void): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    if (!response.body) return response.arrayBuffer();

    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        size += value.byteLength;
        onChunk(value.byteLength);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        joined.set(part, offset);
        offset += part.byteLength;
    }
    return joined.buffer;
}

/**
 * Reads a JSON file that may or may not still be compressed when it arrives.
 *
 * Whether it is depends on the server, not on us: vite's dev server labels the `.gz` file with
 * `Content-Encoding: gzip` and the browser then unwraps it on its own, while nginx serves the
 * same file untouched. Deciding from the bytes rather than from the environment is the only way
 * this works in both without a flag to get wrong.
 *
 * @param url
 * @param onChunk receives the size of every chunk
 * @returns the parsed content
 */
async function fetchMaybeGzippedJson(url: string, onChunk: (bytes: number) => void): Promise<unknown> {
    const buffer = await fetchCounted(url, onChunk);
    const bytes = new Uint8Array(buffer);
    const compressed = bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    if (!compressed) return JSON.parse(new TextDecoder().decode(bytes));

    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
}

/**
 * Loads the packed index.
 *
 * @param onProgress receives a short status per file
 * @returns the searchable index
 */
export async function loadScanIndex(onProgress?: (progress: ScanLoadProgress) => void): Promise<LoadedIndex> {
    let loaded = 0;
    let total = 0;
    const report = (stage: ScanLoadStage) => onProgress?.({ stage, loaded, total, detail: "" });
    // Capped at what the manifest says the file weighs. A server may hand the browser a `.gz`
    // under `Content-Encoding: gzip`, which unwraps it on the way in, so more bytes arrive than
    // were ever sent: the card catalogue counted 147 MB against a stated total of 85.
    const count = (stage: ScanLoadStage, expected: number) => {
        const limit = expected > 0 ? expected : Number.POSITIVE_INFINITY;
        let seen = 0;
        return (bytes: number) => {
            const next = Math.min(limit, seen + bytes);
            loaded += next - seen;
            seen = next;
            onProgress?.({ stage, loaded, total, detail: "" });
        };
    };
    report("manifest");
    // Generated, not committed, and an hour of inference to rebuild, so it is the one asset the
    // dev container cannot quietly fix for itself. Saying which command produces it beats a
    // JSON parse error on an HTML 404 page.
    const entry = await fetch(`${INDEX_ROOT}/manifest.json`);
    if (!entry.ok) {
        throw new Error(
            `Der Scan-Index fehlt unter ${INDEX_ROOT} (HTTP ${entry.status}) — ` +
                `"pnpm run scan:embed" und "pnpm run scan:pack" erzeugen ihn`,
        );
    }
    const manifest = (await entry.json()) as IndexManifest;

    // The payload files sit at fixed paths, so the service worker would happily serve whichever
    // copy it cached first. The manifest's content hash in the query string gives each build its
    // own URL, which is what makes caching them aggressively safe.
    const version = manifest.version ? `?v=${manifest.version}` : "";
    const sizes = manifest.bytes ?? {};
    total = Object.values(sizes).reduce((sum, size) => sum + size, 0);

    report("projection");
    const projection = await fetchCounted(
        `${INDEX_ROOT}/projection.f32${version}`,
        count("projection", sizes["projection.f32"] ?? 0),
    );

    report("vectors");
    const vectors = await fetchCounted(
        `${INDEX_ROOT}/vectors.i8${version}`,
        count("vectors", sizes["vectors.i8"] ?? 0),
    );

    report("cards");
    const cards = (await fetchMaybeGzippedJson(
        `${INDEX_ROOT}/cards.json.gz${version}`,
        count("cards", sizes["cards.json.gz"] ?? 0),
    )) as Parameters<typeof createEmbeddingIndex>[0]["cards"];

    const index = createEmbeddingIndex({ manifest, projection, vectors, cards });
    return Object.assign(index, { manifest });
}

/**
 * Recognises the card in one frame.
 *
 * @param pixels the frame, at full resolution
 * @param index the loaded index
 * @param embedder the loaded model
 * @returns what was found, with timings
 */
export async function scanFrame(pixels: RgbaImage, index: LoadedIndex, embedder: Embedder): Promise<ScanReport> {
    const started = performance.now();
    const timings = { detect: 0, embed: 0, search: 0, verify: 0, total: 0 };

    const cards = await detectCardsIn(pixels);
    timings.detect = performance.now() - started;
    if (cards.length === 0) {
        timings.total = performance.now() - started;
        return {
            outcome: { status: "unrecognised", reason: "no-card", bestInliers: 0 },
            quad: null,
            timings,
            verified: 0,
        };
    }

    // Every quad is tried at both trims and all four quarter turns, because none of those can be
    // resolved from geometry: a sleeve's thickness is unknown and `orderCorners` has no way of
    // knowing which short side is the card's top. The index sorts it out.
    const pool = new Map<string, { score: number; match: IndexMatch }>();
    const crops: { image: RgbaImage; quad: CardQuad; score: number }[] = [];

    for (const card of cards.slice(0, MAX_QUADS)) {
        for (const inset of INSETS) {
            const quad = inset === 0 ? card.quad : shrinkQuad(card.quad, inset);
            const upright = await rectifyCardIn(pixels, quad, 0);
            let best = -Infinity;

            for (let rotation = 0; rotation < 4; rotation += 1) {
                const rectified = rotation === 0 ? upright : await rectifyCardIn(pixels, quad, rotation);
                const embedStarted = performance.now();
                const vector = await embedder.embed(rectified);
                timings.embed += performance.now() - embedStarted;

                const searchStarted = performance.now();
                for (const match of index.search(index.project(vector), 8)) {
                    const key = `${match.printing.id}/${match.printing.face}`;
                    const known = pool.get(key);
                    if (!known || match.score > known.score) pool.set(key, { score: match.score, match });
                    best = Math.max(best, match.score);
                }
                timings.search += performance.now() - searchStarted;
            }
            crops.push({ image: upright, quad, score: best });
        }
    }

    crops.sort((first, second) => second.score - first.score);
    const shortlist = [...pool.values()].sort((first, second) => second.score - first.score).slice(0, SHORTLIST);

    const verifyStarted = performance.now();
    const queries: CardFeatures[] = [];
    for (const crop of crops.slice(0, VERIFY_CROPS)) queries.push(await describeCard(crop.image));

    const verified: { match: IndexMatch; inliers: number; homography: number[] | null; queryIndex: number }[] = [];
    for (const { match } of shortlist) {
        const reference = await loadReferenceImage(match.printing.id, match.printing.face);
        if (!reference) continue;
        const features = await describeCard(reference);

        let inliers = 0;
        let homography: number[] | null = null;
        let queryIndex = 0;
        for (const [index_, query] of queries.entries()) {
            const result = await verifyAgainst(query, features);
            if (result.inliers > inliers) {
                inliers = result.inliers;
                homography = result.homography;
                queryIndex = index_;
            }
        }
        verified.push({ match, inliers, homography, queryIndex });
    }
    verified.sort((first, second) => second.inliers - first.inliers);

    // Printings that are the same picture land within a few percent of each other, so the order
    // between them is noise. Comparing where their references differ is what actually decides.
    const leader = verified[0];
    if (leader) {
        const tied = verified.filter(
            (candidate) =>
                candidate.inliers >= MIN_TIE_INLIERS &&
                candidate.inliers >= leader.inliers * TIE_RATIO &&
                candidate.homography !== null,
        );
        if (tied.length > 1) {
            const references = await Promise.all(
                tied.map((candidate) => loadReferenceImage(candidate.match.printing.id, candidate.match.printing.face)),
            );
            const usable = tied
                .map((candidate, position) => ({ candidate, reference: references[position] }))
                .filter(
                    (pair): pair is { candidate: (typeof tied)[0]; reference: RgbaImage } => pair.reference !== null,
                );
            if (usable.length > 1) {
                const decision = await discriminatePrintings(
                    crops[usable[0].candidate.queryIndex]?.image ?? crops[0].image,
                    usable.map((pair) => ({ reference: pair.reference, homography: pair.candidate.homography! })),
                );
                if (decision) {
                    const winner = usable[decision.index].candidate;
                    verified.splice(verified.indexOf(winner), 1);
                    verified.unshift(winner);
                }
            }
        }
    }
    timings.verify = performance.now() - verifyStarted;
    timings.total = performance.now() - started;

    return {
        outcome: decideScan(verified.map((entry) => ({ match: entry.match, inliers: entry.inliers }))),
        quad: crops[0]?.quad ?? null,
        timings,
        verified: verified.length,
    };
}
