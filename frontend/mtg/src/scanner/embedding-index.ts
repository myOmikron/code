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
    /** The set's full name, as printed */
    setName: string;
    collectorNumber: string;
    lang: string;
    /** Which face of a multi-faced card this row is */
    face: number;
    manaCost: string;
    typeLine: string;
    colors: string[];
    /** Whether this printing was never sold unfoiled, so a scan can mark it without asking */
    foilOnly: boolean;
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
    /** Transfer size of each payload file, so the app can say what a first load costs */
    bytes?: Record<string, number>;
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
type IndexedPrintingSource = {
    i: string;
    n: string;
    s: string;
    /** Set name, absent on rows packed before it was carried */
    S?: string;
    c: string;
    l: string;
    f: number;
    m?: string;
    t?: string;
    k?: string[];
    p?: string;
    /** 1 when the printing only ever existed as foil; absent otherwise */
    o?: number;
};

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
    /**
     * How many printings share a name
     *
     * @param name a name already resolved by {@link EmbeddingIndex.resolveName}
     * @returns the count, 0 for an unknown name
     */
    countNamed(name: string): number;
    /**
     * Every set the catalogue holds, with how many printings each has
     *
     * @returns the sets, largest first
     */
    sets(): { code: string; name: string; cardCount: number }[];
    /**
     * Every printing filed under a name
     *
     * The catalogue is already in memory, so correcting a printing needs no second index and no
     * further download. It is the same 450000 rows the scanner searches.
     *
     * @param name as read or as catalogued
     * @returns the printings, empty for an unknown name
     */
    printingsNamed(name: string): IndexedPrinting[];
};

/**
 * Reads one catalogue row as a printing
 *
 * @param card the packed row
 * @returns the printing
 */
function toPrinting(card: IndexedPrintingSource): IndexedPrinting {
    return {
        id: card.i,
        name: card.n,
        set: card.s,
        setName: card.S ?? "",
        collectorNumber: card.c,
        lang: card.l,
        face: card.f,
        manaCost: card.m ?? "",
        typeLine: card.t ?? "",
        colors: card.k ?? [],
        foilOnly: card.o === 1,
    };
}

/** Shortest reading that may be matched by containment rather than equality. */
const MIN_MATCH_LENGTH = 8;
/** Shortest reading worth matching by edit distance at all. */
const MIN_FUZZY_LENGTH = 4;

/**
 * Edit distance between two strings, giving up once it exceeds a bound.
 *
 * The bound is what makes this affordable against 35k names: most pairs differ in their first few
 * characters and are abandoned almost immediately.
 *
 * @param a
 * @param b
 * @param bound largest distance still of interest
 * @returns the distance, or bound + 1 when it exceeds the bound
 */
function editDistance(a: string, b: string, bound: number): number {
    if (Math.abs(a.length - b.length) > bound) return bound + 1;
    let previous = new Uint16Array(b.length + 1);
    let current = new Uint16Array(b.length + 1);
    for (let j = 0; j <= b.length; j += 1) previous[j] = j;

    for (let i = 1; i <= a.length; i += 1) {
        current[0] = i;
        let best = current[0];
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
            if (current[j] < best) best = current[j];
        }
        if (best > bound) return bound + 1;
        const swap = previous;
        previous = current;
        current = swap;
    }
    return previous[b.length];
}

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
    return (
        name
            .split("//")[0]
            .toLowerCase()
            // Any script's letters and digits, not just ASCII. Stripping to `a-z0-9` erased every
            // Japanese name to an empty string, which then matched everything and nothing.
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim()
    );
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

    // Built on first use rather than on load. It costs about 700 ms on a desktop and several
    // seconds on a phone, all of it after everything has been downloaded, and none of it is needed
    // to show a camera. Paying it when the first title is actually read hides it behind the second
    // or so it takes someone to line up their first card.
    let rowsByName: Map<string, number[]> | null = null;

    /**
     * The name index, built the first time a name has to be resolved.
     *
     * Every printing is filed under both what the catalogue calls it and what is printed on it.
     * The reader sees 暴虐の覇王アスマディ while the catalogue says Vaevictis Asmadi, and either
     * has to find the same rows. A Japanese reading resolving to nothing was the whole reason the
     * printings were added to the index in the first place.
     *
     * @returns name key to rows
     */
    const names = (): Map<string, number[]> => {
        if (rowsByName) return rowsByName;
        const built = new Map<string, number[]>();
        const file = (name: string, row: number) => {
            const rows = built.get(name);
            if (rows) rows.push(row);
            else built.set(name, [row]);
        };
        for (let row = 0; row < count; row += 1) {
            const card = cards[row];
            const catalogued = nameKey(card.n);
            if (catalogued) file(catalogued, row);
            if (card.p) {
                const printed = nameKey(card.p);
                if (printed && printed !== catalogued) file(printed, row);
            }
        }
        rowsByName = built;
        return built;
    };

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
            printing: toPrinting(card),
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
        if (names().has(key)) return key;

        // The length floor guards containment only. Applied to the whole function it also barred
        // every short reading from the distance match below, which is where "Condemm" and
        // "Abradde" — one character from a real name each — were being thrown away.
        let contained = "";
        for (const candidate of names().keys()) {
            if (key.length < MIN_MATCH_LENGTH) break;
            if (candidate.length < MIN_MATCH_LENGTH || !candidate.includes(key)) continue;
            if (contained) {
                contained = "";
                break;
            }
            contained = candidate;
        }
        if (contained) return contained;

        // Nothing matched as text, so match as a misreading. Tesseract's stock English model was
        // never shown the typefaces these cards are set in, and it shows: on flawless reference
        // scans it gets 28 names of 60 exactly right, and most of the rest are off by a letter —
        // "Bitierblade Warrior", "Timberwatch EIf", "Drana's Binissary". Against a closed list of
        // 35k valid names those are not failures, they are near misses, and the list is the
        // dictionary the recogniser never had. The winner must be alone at its distance, because
        // a tie means the reading genuinely does not say which card this is.
        // Spaces are compared away rather than compared. A reading loses and invents them freely
        // — "Outoffime" for Out of Time, "DlorthernDaladin" for Northern Paladin — and counting
        // each one as a difference spends the whole error budget on the one kind of error that
        // says nothing about which card this is.
        const tight = key.replace(/ /g, "");
        // Below this a reading carries no evidence and the distance match turns noise into
        // confidence: "a" is one edit from a card actually named "x", and answering with it sends
        // verification after the wrong printings. A miss is a far cheaper mistake than a hit.
        if (tight.length < MIN_FUZZY_LENGTH) return "";
        // How much an edit is worth depends on the script. A Latin letter is a fraction of a
        // syllable and a misread one says almost nothing; a kanji is a whole morpheme, and two of
        // them apart is a different card — 暴虐の覇王アスマディ resolved to 暴虐の龍アスマディ
        // under a budget meant for Latin. Ideographs therefore get a much tighter allowance.
        const dense = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(tight);
        const bound = dense ? Math.max(1, Math.floor(tight.length / 10)) : Math.max(2, Math.floor(tight.length / 4));
        let best = "";
        let bestDistance = bound + 1;
        let tied = false;
        for (const candidate of names().keys()) {
            // No length floor here. That belongs to the containment rule above, where a short
            // fragment matches half the catalogue; a distance of one from "Abrade" is not a
            // fragment of anything, and excluding six-letter names lost Condemn, Flumph and
            // Abrade to readings that were one character out.
            if (!candidate) continue;
            const distance = editDistance(tight, candidate.replace(/ /g, ""), bound);
            if (distance > bound) continue;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = candidate;
                tied = false;
            } else if (distance === bestDistance) {
                tied = true;
            }
        }
        return tied ? "" : best;
    };

    const searchNamed = (query: Float32Array, name: string, limit = 8): IndexMatch[] => {
        const rows = names().get(resolveName(name));
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
                printing: toPrinting(card),
            });
        }
        return matches;
    };

    const countNamed = (name: string): number => names().get(name)?.length ?? 0;

    let setList: { code: string; name: string; cardCount: number }[] | null = null;

    /**
     * The sets, counted once and kept.
     *
     * Read off the catalogue rather than fetched: it is already here, and the list the scanner
     * used to offer came from an index that no longer exists, so the set filter had nothing to
     * choose between.
     *
     * @returns the sets, largest first
     */
    const sets = (): { code: string; name: string; cardCount: number }[] => {
        if (setList) return setList;
        const counted = new Map<string, { code: string; name: string; cardCount: number }>();
        for (const card of cards) {
            const held = counted.get(card.s);
            if (held) {
                held.cardCount += 1;
                if (!held.name && card.S) held.name = card.S;
            } else {
                counted.set(card.s, { code: card.s, name: card.S ?? "", cardCount: 1 });
            }
        }
        setList = [...counted.values()].sort((left, right) => right.cardCount - left.cardCount);
        return setList;
    };

    const printingsNamed = (name: string): IndexedPrinting[] =>
        (names().get(resolveName(name)) ?? []).map((row) => toPrinting(cards[row]));

    return { manifest, project, search, searchNamed, resolveName, countNamed, printingsNamed, sets };
}
