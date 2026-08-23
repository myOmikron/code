//! The recognition chain, split for live use.
//!
//! A single-shot scan may spend seconds on one picture. A live scanner may not: it sees four to
//! ten frames a second and has to stay responsive between them. What makes that possible is that
//! the two halves of the chain cost wildly different amounts. Detection, embedding and the index
//! search are local and quick. Verification loads reference images over the network and compares
//! descriptors, and it is the only part that can say for certain which printing this is.
//!
//! So verification does not run per frame. It runs when the cheap half has said the same thing
//! twice, which is both a good sign that the card is being held still and the point at which the
//! answer is worth confirming. Everything it loads is cached, so the second look at a candidate
//! costs nothing.
import { detectCardsIn, rectifyCardIn, shrinkQuad } from "./card-detect";
import type { CardQuad, Point, RgbaImage } from "./card-detect";
import type { EmbeddingIndex, IndexMatch } from "./embedding-index";
import type { Embedder } from "./embedder";
import { describeCard, discriminatePrintings, verifyAgainst } from "./feature-verify";
import type { CardFeatures } from "./feature-verify";
import { loadReferenceImage } from "./reference-images";
import { decideScan } from "./scan-decision";
import type { ScanOutcome } from "./scan-decision";

/**
 * The crop variants, one per frame rather than all per frame.
 *
 * A sleeve's thickness and whether the card is upside down are both unknown, and a single-shot
 * scan has to try every combination because it gets one look. A live scanner does not: it gets
 * another frame in a fraction of a second. Spreading the combinations across frames costs one
 * model run per frame instead of four, and covers the same ground within half a second.
 *
 * Rotations are only upright and upside down. Cards are held roughly the way the camera is, and
 * a card lying on its side is rare enough to be worth catching on a later frame instead.
 */
const VARIANTS: { inset: number; rotation: number }[] = [
    { inset: 0.04, rotation: 0 },
    { inset: 0, rotation: 0 },
    { inset: 0.04, rotation: 0 },
    { inset: 0, rotation: 0 },
    { inset: 0.04, rotation: 2 },
    { inset: 0, rotation: 2 },
];
/**
 * Share of the frame's height the guide rectangle covers.
 *
 * The interface draws a card-shaped guide and asks for the card to be put inside it, and
 * detection then only looks there. That is worth more than any amount of tuning: the failures
 * this removes are not cards that were judged wrongly but backgrounds that were judged at all.
 * A patterned playmat produces long straight lines and rectangles of its own, and no shape test
 * can rule those out once they are in the picture.
 */
const GUIDE_HEIGHT_FRACTION = 0.62;
/** Slack around the guide, so a card held slightly outside it is still seen. */
const GUIDE_MARGIN = 1.25;
/** How many printings the embedding hands to verification. Fewer than the bench uses, on purpose. */
const LIVE_SHORTLIST = 6;
/** How many of the recent frames must name a printing before the expensive half runs. */
const AGREEMENT_HITS = 2;
/**
 * How far back agreement is counted.
 *
 * Not consecutive frames. Consecutive would be the obvious rule and is the wrong one here,
 * because the crop variants are deliberately spread across frames: two frames in a row look at
 * different crops and are meant to disagree. What a real card produces instead is the same name
 * recurring among the last few frames, with the variants that do not suit it falling in between.
 */
const AGREEMENT_WINDOW = 4;
/** Share of the best inlier count within which candidates count as tied. */
const TIE_RATIO = 0.95;
/** Below this, a tie is not worth resolving because neither candidate convinces. */
const MIN_TIE_INLIERS = 40;

/**
 * The part of a frame detection is allowed to look at
 */
export type Region = { x: number; y: number; width: number; height: number };

/**
 * The region the guide marks out, in frame coordinates.
 *
 * Card-shaped and centred, so what the user is asked to line up with is exactly what is
 * searched. The margin keeps a card that overshoots the guide from falling outside it.
 *
 * @param width of the frame
 * @param height of the frame
 * @returns the region to search
 */
export function guideRegion(width: number, height: number): Region {
    const guideHeight = height * GUIDE_HEIGHT_FRACTION;
    const guideWidth = guideHeight * (63 / 88);
    const searchHeight = Math.min(height, guideHeight * GUIDE_MARGIN);
    const searchWidth = Math.min(width, guideWidth * GUIDE_MARGIN);
    return {
        x: Math.round((width - searchWidth) / 2),
        y: Math.round((height - searchHeight) / 2),
        width: Math.round(searchWidth),
        height: Math.round(searchHeight),
    };
}

/**
 * Cuts a region out of a frame
 *
 * @param pixels the frame
 * @param region the part to keep
 * @returns the cut-out pixels
 */
function cutRegion(pixels: RgbaImage, region: Region): RgbaImage {
    const data = new Uint8ClampedArray(region.width * region.height * 4);
    for (let row = 0; row < region.height; row += 1) {
        const from = ((region.y + row) * pixels.width + region.x) * 4;
        data.set(pixels.data.subarray(from, from + region.width * 4), row * region.width * 4);
    }
    return { data, width: region.width, height: region.height };
}

/**
 * Moves a quad from region coordinates back into the frame's
 *
 * @param quad
 * @param region
 * @returns the quad in frame coordinates
 */
function offsetQuad(quad: CardQuad, region: Region): CardQuad {
    const move = (point: Point): Point => ({ x: point.x + region.x, y: point.y + region.y });
    return {
        topLeft: move(quad.topLeft),
        topRight: move(quad.topRight),
        bottomRight: move(quad.bottomRight),
        bottomLeft: move(quad.bottomLeft),
    };
}

/**
 * Where one frame's milliseconds went
 */
export type FrameTimings = { detect: number; embed: number; search: number };

/**
 * What the cheap half of the chain found in one frame
 */
export type FramePreview = {
    /** Best printings by embedding alone, best first */
    candidates: IndexMatch[];
    /** The rectified crops they came from, for verification to reuse */
    crops: RgbaImage[];
    /** Where the card sits in the frame, for the overlay */
    quad: CardQuad | null;
    /** How much of the frame the detection covers, 0 to 1 */
    areaFraction: number;
    /** The part of the frame that was searched, so the guide can mark exactly it */
    region: Region;
    milliseconds: number;
    timings: FrameTimings;
};

/**
 * Reference material for one printing, kept between frames
 */
type CachedReference = { image: RgbaImage; features: CardFeatures };

const references = new Map<string, CachedReference | null>();

/**
 * Loads a printing's reference and its descriptors, once.
 *
 * @param printing
 * @returns the cached reference, or null when it cannot be fetched
 */
async function reference(printing: IndexMatch["printing"]): Promise<CachedReference | null> {
    const key = `${printing.id}/${printing.face}`;
    const known = references.get(key);
    if (known !== undefined) return known;

    const image = await loadReferenceImage(printing.id, printing.face);
    const entry = image ? { image, features: await describeCard(image) } : null;
    references.set(key, entry);
    return entry;
}

/**
 * Runs the local half of the chain on one frame.
 *
 * @param pixels the frame
 * @param index the loaded index
 * @param embedder the loaded model
 * @param frameNumber counts up per frame, which is what spreads the crop variants
 * @returns the best candidates and the crops they came from
 */
export async function previewFrame(
    pixels: RgbaImage,
    index: EmbeddingIndex,
    embedder: Embedder,
    frameNumber: number,
): Promise<FramePreview> {
    const started = performance.now();
    const timings: FrameTimings = { detect: 0, embed: 0, search: 0 };

    const region = guideRegion(pixels.width, pixels.height);
    const searched = cutRegion(pixels, region);
    const detected = await detectCardsIn(searched, { maxCards: 1 });
    timings.detect = performance.now() - started;
    if (detected.length === 0) {
        return {
            candidates: [],
            crops: [],
            quad: null,
            areaFraction: 0,
            region,
            milliseconds: performance.now() - started,
            timings,
        };
    }

    const card = detected[0];
    const variant = VARIANTS[frameNumber % VARIANTS.length];
    const quad = variant.inset === 0 ? card.quad : shrinkQuad(card.quad, variant.inset);
    const crop = await rectifyCardIn(searched, quad, variant.rotation);

    const embedStarted = performance.now();
    const vector = await embedder.embed(crop);
    timings.embed = performance.now() - embedStarted;

    const searchStarted = performance.now();
    const candidates = index.search(index.project(vector), LIVE_SHORTLIST);
    timings.search = performance.now() - searchStarted;

    return {
        candidates,
        crops: [crop],
        quad: offsetQuad(card.quad, region),
        areaFraction: card.areaFraction,
        region,
        milliseconds: performance.now() - started,
        timings,
    };
}

/**
 * Confirms a preview by matching local features against the candidates' reference scans.
 *
 * @param preview what the cheap half produced
 * @returns the answer, or why there is none
 */
export async function confirmPreview(preview: FramePreview): Promise<ScanOutcome> {
    if (preview.candidates.length === 0 || preview.crops.length === 0) {
        return { status: "unrecognised", reason: "no-card", bestInliers: 0 };
    }

    const query = await describeCard(preview.crops[0]);
    const verified: { match: IndexMatch; inliers: number; homography: number[] | null }[] = [];
    for (const match of preview.candidates) {
        const entry = await reference(match.printing);
        if (!entry) continue;
        const result = await verifyAgainst(query, entry.features);
        verified.push({ match, inliers: result.inliers, homography: result.homography });
    }
    verified.sort((first, second) => second.inliers - first.inliers);

    const leader = verified[0];
    if (leader) {
        const tied = verified.filter(
            (candidate) =>
                candidate.inliers >= MIN_TIE_INLIERS &&
                candidate.inliers >= leader.inliers * TIE_RATIO &&
                candidate.homography !== null,
        );
        if (tied.length > 1) {
            const usable = tied
                .map((candidate) => ({
                    candidate,
                    entry: references.get(`${candidate.match.printing.id}/${candidate.match.printing.face}`),
                }))
                .filter((pair): pair is { candidate: (typeof tied)[0]; entry: CachedReference } => Boolean(pair.entry));
            if (usable.length > 1) {
                const decision = await discriminatePrintings(
                    preview.crops[0],
                    usable.map((pair) => ({ reference: pair.entry.image, homography: pair.candidate.homography! })),
                );
                if (decision) {
                    const winner = usable[decision.index].candidate;
                    verified.splice(verified.indexOf(winner), 1);
                    verified.unshift(winner);
                }
            }
        }
    }

    return decideScan(verified.map((entry) => ({ match: entry.match, inliers: entry.inliers })));
}

/**
 * Counts how often a printing has come up among the recent frames
 */
export type AgreementTracker = {
    /**
     * Records this frame's leading printing and reports whether enough recent frames agree
     *
     * @param id the leading printing, or null when nothing was found
     * @returns whether the window holds enough hits for this printing
     */
    seen(id: string | null): boolean;
    /** Forgets the window, after a card is accepted or taken away */
    reset(): void;
};

/**
 * Tracks agreement over a sliding window, which is what gates the expensive half.
 *
 * @returns a tracker that reports when a candidate has come up often enough
 */
export function createAgreementTracker(): AgreementTracker {
    let window: (string | null)[] = [];
    return {
        /**
         * Records this frame's leader and reports whether the window agrees
         *
         * @param id
         * @returns whether enough recent frames named it
         */
        seen(id: string | null): boolean {
            window.push(id);
            if (window.length > AGREEMENT_WINDOW) window.shift();
            if (id === null) return false;
            return window.filter((entry) => entry === id).length >= AGREEMENT_HITS;
        },
        /**
         * Forgets the window
         */
        reset(): void {
            window = [];
        },
    };
}
