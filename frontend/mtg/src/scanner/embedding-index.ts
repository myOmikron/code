//! Nearest-neighbour search over the packed reference index.
//!
//! The index is a flat int8 matrix, searched exhaustively. That is a deliberate choice over an
//! approximate structure: 111k rows of 128 int8 is 14 MB and one query is 14 million multiply
//! adds, which a typed-array loop does in a few milliseconds. An ANN index would save little,
//! cost recall, and add a build step whose correctness is much harder to verify.
//!
//! The index is also the scanner's card detector of last resort. A quad that rectified into a
//! piece of playmat has no near neighbour here, so a low best score is the signal that the
//! detection was wrong, not that the card is unknown.
import { EMBEDDING_DIM, PREPROCESSING } from "./embedding";
import type { Preprocessing } from "./embedding";

/**
 * What the index says about one printing
 */
export type IndexedPrinting = {
    /** Scryfall id of the printing */
    id: string;
    name: string;
    set: string;
    collectorNumber: string;
    lang: string;
    /** Which face of a multi-faced card this row is */
    face: number;
};

/**
 * One search result
 */
export type IndexMatch = {
    printing: IndexedPrinting;
    /** Cosine similarity in the projected space, -1 to 1 */
    score: number;
};

/**
 * The manifest written by `pack-embedding-index.py`
 */
export type IndexManifest = {
    formatVersion: number;
    /** Content hash of the payload files; part of their URL so a rebuilt index invalidates */
    version?: string;
    model: string;
    /** Which preprocessing the vectors were built with; must match what the app applies */
    preprocessing?: string;
    sourceDim: number;
    dim: number;
    count: number;
    scale: number;
};

/**
 * The raw files the index is built from
 */
export type IndexBuffers = {
    manifest: IndexManifest;
    /** mean vector followed by `dim` rows of `sourceDim` floats */
    projection: ArrayBuffer;
    /** `count` rows of `dim` int8 values */
    vectors: ArrayBuffer;
    cards: IndexedPrintingSource[];
};

/**
 * A printing as stored in cards.json.gz, with short keys to keep the file small
 */
type IndexedPrintingSource = { i: string; n: string; s: string; c: string; l: string; f: number };

/**
 * A loaded, searchable index
 */
export type EmbeddingIndex = {
    manifest: IndexManifest;
    /**
     * Projects a pooled embedding into the index space and returns it L2 normalized
     *
     * @param embedding a vector of length EMBEDDING_DIM
     * @returns the projected, normalized vector
     */
    project(embedding: Float32Array): Float32Array;
    /**
     * Returns the closest printings to a projected query
     *
     * @param query a projected, normalized vector
     * @param limit how many results
     * @returns the closest printings, best first
     */
    search(query: Float32Array, limit?: number): IndexMatch[];
    /**
     * Returns the printings of one card name, ranked against the query
     *
     * @param query a projected, normalized vector
     * @param name the card name, as printed on the card
     * @param limit how many results
     * @returns that name's printings, best first, empty if the name is unknown
     */
    searchNamed(query: Float32Array, name: string, limit?: number): IndexMatch[];
    /**
     * Turns a reading of a card's title into a name the index knows, or nothing
     *
     * @param text what was read off the card
     * @returns the matching card name, or an empty string
     */
    resolveName(text: string): string;
};

/** Shortest reading that may be matched by containment rather than equality. */
const MIN_MATCH_LENGTH = 8;

/**
 * Strips a name down to what is comparable between a card and a reading of it.
 *
 * Only the front face: a split or adventure card is indexed under "A // B" and prints only "A"
 * on the title bar, which is all a camera ever sees.
 *
 * @param name
 * @returns the normalized key
 */
export function nameKey(name: string): string {
    return name
        .split("//")[0]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/**
 * Builds a searchable index from the packed files.
 *
 * @param buffers
 * @param expected which preprocessing the caller applies to its queries
 * @returns the index
 */
export function createEmbeddingIndex(buffers: IndexBuffers, expected: Preprocessing = PREPROCESSING): EmbeddingIndex {
    const { manifest, cards } = buffers;
    const { dim, count, sourceDim, scale } = manifest;

    if (manifest.preprocessing !== expected) {
        throw new Error(
            `Index wurde mit "${manifest.preprocessing ?? "unbekannt"}" gebaut, die App erwartet "${expected}"`,
        );
    }
    if (sourceDim !== EMBEDDING_DIM) {
        throw new Error(`Index erwartet ${sourceDim} Eingangsdimensionen, das Modell liefert ${EMBEDDING_DIM}`);
    }
    const projection = new Float32Array(buffers.projection);
    if (projection.length !== (dim + 1) * sourceDim) {
        throw new Error(`projection.f32 hat ${projection.length} Werte, erwartet ${(dim + 1) * sourceDim}`);
    }
    const vectors = new Int8Array(buffers.vectors);
    if (vectors.length !== count * dim) {
        throw new Error(`vectors.i8 hat ${vectors.length} Werte, erwartet ${count * dim}`);
    }
    if (cards.length !== count) {
        throw new Error(`cards.json hat ${cards.length} Einträge, erwartet ${count}`);
    }

    const project = (embedding: Float32Array): Float32Array => {
        const centred = new Float32Array(sourceDim);
        for (let d = 0; d < sourceDim; d += 1) centred[d] = embedding[d] - projection[d];

        const output = new Float32Array(dim);
        let norm = 0;
        for (let component = 0; component < dim; component += 1) {
            const offset = (component + 1) * sourceDim;
            let sum = 0;
            for (let d = 0; d < sourceDim; d += 1) sum += centred[d] * projection[offset + d];
            output[component] = sum;
            norm += sum * sum;
        }
        norm = Math.sqrt(norm) || 1;
        for (let component = 0; component < dim; component += 1) output[component] /= norm;
        return output;
    };

    // Built once so a name can be turned into rows without walking the whole index. The scanner
    // needs this when the embedding has failed outright: a foil under glare can put the right
    // printing beyond rank a thousand, and at that point the only usable signal left is the name
    // printed on the card.
    const rowsByName = new Map<string, number[]>();
    for (let row = 0; row < count; row += 1) {
        const key = nameKey(cards[row].n);
        const rows = rowsByName.get(key);
        if (rows) rows.push(row);
        else rowsByName.set(key, [row]);
    }

    const quantise = (query: Float32Array): Int8Array => {
        const quantised = new Int8Array(dim);
        for (let d = 0; d < dim; d += 1) {
            quantised[d] = Math.max(-127, Math.min(127, Math.round(query[d] * scale)));
        }
        return quantised;
    };

    const describe = (row: number, dot: number): IndexMatch => {
        const card = cards[row];
        return {
            score: dot / (scale * scale),
            printing: {
                id: card.i,
                name: card.n,
                set: card.s,
                collectorNumber: card.c,
                lang: card.l,
                face: card.f,
            },
        };
    };

    /**
     * Matches a reading against the names the index knows.
     *
     * Exact first, then the reading as a substring of a name. A title read off a camera frame
     * rarely comes back wrong in the middle; it comes back short. "Soaring City" is Otawara,
     * Soaring City and fails an equality test for want of the part the crop cut off.
     *
     * Only that direction. Allowing a name to be a substring of the *reading* sounded symmetric
     * and is not: short names like "Soar" sit inside half the readings there are, and every one
     * of them then counts as a rival and kills the match. For the same reason the match must be
     * unique and both sides need enough letters to mean something — and the catalogue contains a
     * name that normalises to nothing at all, which is inside every string in existence.
     *
     * @param text what was read
     * @returns the card name, or an empty string
     */
    const resolveName = (text: string): string => {
        const key = nameKey(text);
        if (!key) return "";
        if (rowsByName.has(key)) return key;
        if (key.length < MIN_MATCH_LENGTH) return "";

        let found = "";
        for (const candidate of rowsByName.keys()) {
            if (candidate.length < MIN_MATCH_LENGTH || !candidate.includes(key)) continue;
            if (found) return "";
            found = candidate;
        }
        return found;
    };

    const searchNamed = (query: Float32Array, name: string, limit = 8): IndexMatch[] => {
        const rows = rowsByName.get(resolveName(name));
        if (!rows) return [];
        const quantised = quantise(query);
        const scored = rows.map((row) => {
            let dot = 0;
            for (let d = 0; d < dim; d += 1) dot += quantised[d] * vectors[row * dim + d];
            return describe(row, dot);
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit);
    };

    const search = (query: Float32Array, limit = 5): IndexMatch[] => {
        const quantised = new Int8Array(dim);
        for (let d = 0; d < dim; d += 1) {
            quantised[d] = Math.max(-127, Math.min(127, Math.round(query[d] * scale)));
        }

        const bestScores = new Float32Array(limit).fill(-Infinity);
        const bestRows = new Int32Array(limit).fill(-1);

        for (let row = 0; row < count; row += 1) {
            const offset = row * dim;
            let dot = 0;
            for (let d = 0; d < dim; d += 1) dot += quantised[d] * vectors[offset + d];
            if (dot <= bestScores[limit - 1]) continue;

            let slot = limit - 1;
            while (slot > 0 && bestScores[slot - 1] < dot) {
                bestScores[slot] = bestScores[slot - 1];
                bestRows[slot] = bestRows[slot - 1];
                slot -= 1;
            }
            bestScores[slot] = dot;
            bestRows[slot] = row;
        }

        const divisor = scale * scale;
        const matches: IndexMatch[] = [];
        for (let rank = 0; rank < limit; rank += 1) {
            const row = bestRows[rank];
            if (row < 0) break;
            const card = cards[row];
            matches.push({
                score: bestScores[rank] / divisor,
                printing: {
                    id: card.i,
                    name: card.n,
                    set: card.s,
                    collectorNumber: card.c,
                    lang: card.l,
                    face: card.f,
                },
            });
        }
        return matches;
    };

    return { manifest, project, search, searchNamed, resolveName };
}
