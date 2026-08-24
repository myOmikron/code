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
import { loadReader } from "./ocr";
import { loadReferenceImage } from "./reference-images";
import { decideScan } from "./scan-decision";
import type { ScanOutcome } from "./scan-decision";

/**
 * The crop variants, one per frame rather than all per frame.
 *
 * A sleeve's thickness and whether the card is upside down are both unknown, and a single-shot
 * scan has to try every combination because it gets one look. A live scanner does not: it gets
 * another frame, so it spends one model run per frame instead of four.
 *
 * The list used to be padded with duplicates so that the upright crops came up more often than
 * the upside-down ones. {@link createVariantSelector} makes that unnecessary and harmful: it
 * follows whichever variant is scoring best anyway, and duplicates only cost it exploration
 * slots.
 *
 * Rotations are only upright and upside down. Cards are held roughly the way the camera is, and
 * a card lying on its side is rare enough to be worth catching on a later frame instead.
 */
const VARIANTS: { inset: number; rotation: number }[] = [
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
/** Printings of a read name handed to verification, ahead of what the picture proposed. */
const NAMED_CANDIDATES = 6;
/**
 * Long side the guide region is reduced to before edges are looked for.
 *
 * Lower than the single-shot default, because the two are answering different questions. A bench
 * photo has one chance and a whole card's worth of frame to find; a live frame has already been
 * cut down to the guide, so the card fills most of what is left and its outline survives a
 * coarser look.
 *
 * It is also the rare change that is faster *and* better. Over the 24 labelled playmat photos the
 * leading candidate was right 17 times at this size against 13 at 720, at 333 ms a frame against
 * 460. A coarser edge map has less of the mat's printed pattern in it to be distracted by. 300
 * scored the same and ran quicker still; this is the middle, for cards that do not fill the guide.
 */
const LIVE_WORKING_SIZE = 420;
/** How many of the recent frames must name a printing before the expensive half runs. */
const AGREEMENT_HITS = 2;
/**
 * How often the variant selector tries something other than its current favourite.
 *
 * Cycling blindly through the variants assumes frames are cheap. On a phone running the model on
 * WASM a frame costs the better part of two seconds, and half of them were being spent on a crop
 * that was wrong for the card in view: on one sleeved card the 4% inset named the right printing
 * every time and the bare crop a different, wrong one, turn and turn about. Following whichever
 * variant is currently scoring best, and spending every third frame checking the others, keeps
 * the discovery without paying for it on every frame.
 */
const EXPLORE_EVERY = 3;
/**
 * Whether a variant may be settled on rather than merely sampled.
 *
 * Only upright crops. Rotated ones exist to help the embedding, and nothing downstream needs
 * them: ORB verification is rotation invariant, and the name is read from either end of the card.
 * Letting the selector settle on a rotated crop, meanwhile, costs twice: on a foil the model
 * cannot read at all, every crop scores around the same middling value, and it locked onto one
 * that was plainly upside down on screen, which then also put the title bar out of reach. A
 * margin was not enough, because the differences it was choosing between were noise. Sampling
 * them still happens, so an upside-down card is still seen.
 *
 * @param variant an index into the variant list
 * @returns whether the selector may settle on it
 */
const exploitable = (variant: number): boolean => VARIANTS[variant].rotation === 0;
/**
 * How far back agreement is counted.
 *
 * Not consecutive frames. Consecutive would be the obvious rule and is the wrong one here,
 * because the crop variants are deliberately spread across frames: two frames in a row look at
 * different crops and are meant to disagree. What a real card produces instead is the same name
 * recurring among the last few frames, with the variants that do not suit it falling in between.
 *
 * Counting hits alone is not enough, and the reason is arithmetic rather than perception: the
 * variant cycle has period two and this window is four, so *every* variant repeats itself inside
 * it and agrees with itself. On one sleeved card the 4% inset kept naming the right printing at
 * 0.618 and the bare crop the wrong one at 0.540, and both were declared agreed, every other
 * frame, each dragging six reference images over the network. Agreement therefore also requires
 * being the best-scoring candidate in the window, which is what the counting was standing in for.
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
export type FrameTimings = { detect: number; embed: number; search: number; ocr: number };

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
    /** What the title bar read, empty when nothing legible was found */
    title: string;
    /** Why reading failed, empty when it did not */
    ocrError: string;
    /** Whether the leading candidate came from the name rather than from the picture */
    named: boolean;
    /** How well the picture alone matched, which is what the variant selector is judged on */
    sightScore: number;
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
 * @param variantIndex which crop variant to try, from {@link createVariantSelector}
 * @returns the best candidates and the crops they came from
 */
export async function previewFrame(
    pixels: RgbaImage,
    index: EmbeddingIndex,
    embedder: Embedder,
    variantIndex: number,
): Promise<FramePreview> {
    const started = performance.now();
    const timings: FrameTimings = { detect: 0, embed: 0, search: 0, ocr: 0 };

    const region = guideRegion(pixels.width, pixels.height);
    const searched = cutRegion(pixels, region);
    const detected = await detectCardsIn(searched, { maxCards: 1, workingSize: LIVE_WORKING_SIZE });
    timings.detect = performance.now() - started;
    if (detected.length === 0) {
        return {
            candidates: [],
            crops: [],
            quad: null,
            areaFraction: 0,
            region,
            title: "",
            ocrError,
            named: false,
            sightScore: 0,
            milliseconds: performance.now() - started,
            timings,
        };
    }

    const card = detected[0];
    const variant = VARIANTS[variantIndex % VARIANTS.length];
    const quad = variant.inset === 0 ? card.quad : shrinkQuad(card.quad, variant.inset);
    const crop = await rectifyCardIn(searched, quad, variant.rotation);

    const embedStarted = performance.now();
    const vector = await embedder.embed(crop);
    timings.embed = performance.now() - embedStarted;

    const searchStarted = performance.now();
    const projected = index.project(vector);
    const bySight = index.search(projected, LIVE_SHORTLIST);
    timings.search = performance.now() - searchStarted;

    // The name is read every frame rather than only when the picture looks doubtful, because a
    // failed picture does not look doubtful: on the card that prompted this, the wrong answer
    // scored 0.644 and the right one 0.336, so any confidence threshold would have kept quiet
    // exactly when it was needed. A strip of text costs a fraction of one model run.
    const ocrStarted = performance.now();
    const title = await readName(crop);
    const byName = title ? index.searchNamed(projected, title, NAMED_CANDIDATES) : [];
    timings.ocr = performance.now() - ocrStarted;

    // A name that exists in the index is worth more than any cosine, so its printings go first
    // and verification sees them first. When the reading is wrong they simply fail to verify,
    // and the ones the picture proposed are still there behind them.
    const seen = new Set(byName.map((match) => match.printing.id));
    const candidates = [...byName, ...bySight.filter((match) => !seen.has(match.printing.id))];

    return {
        candidates,
        title,
        ocrError,
        named: byName.length > 0,
        sightScore: bySight[0]?.score ?? 0,
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
/**
 * Why the last attempt to read a name failed, for the debug panel.
 *
 * A silent fallback is the right behaviour and the wrong diagnosis: the first build of this shipped
 * with OCR never running at all, and the only symptom was an empty string next to a zero. The
 * reason is kept so the panel can show it.
 */
let ocrError = "";

/**
 * Reads the card's name, returning nothing rather than failing when OCR is unavailable.
 *
 * @param crop a rectified card
 * @returns the name, or an empty string
 */
async function readName(crop: RgbaImage): Promise<string> {
    try {
        const name = await (await loadReader()).readTitle(crop);
        ocrError = "";
        return name;
    } catch (error) {
        ocrError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        return "";
    }
}

/**
 * Reports why the last name reading failed
 *
 * @returns the message, or an empty string when nothing went wrong
 */
export function lastOcrError(): string {
    return ocrError;
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
     * Records this frame's leading printing and reports whether the window backs it
     *
     * @param id the leading printing, or null when nothing was found
     * @param score how well it matched, which decides between candidates that both recur
     * @param named whether it came from the name on the card rather than from the picture
     * @returns whether this printing is the window's best and has come up often enough
     */
    seen(id: string | null, score: number, named: boolean): boolean;
    /** Forgets the window, after a card is accepted or taken away */
    reset(): void;
};

/**
 * Chooses which crop variant a frame should spend its one model run on.
 *
 * @returns a selector that follows the best-scoring variant and keeps sampling the rest
 */
export function createVariantSelector(): VariantSelector {
    const recent = new Float32Array(VARIANTS.length).fill(-1);
    let frame = -1;
    let explored = -1;
    return {
        /**
         * Picks the variant for the next frame
         *
         * @returns an index into the variant list
         */
        next(): number {
            frame += 1;
            if (frame % EXPLORE_EVERY !== 0) {
                let best = -1;
                for (let variant = 0; variant < VARIANTS.length; variant += 1) {
                    if (!exploitable(variant) || recent[variant] < 0) continue;
                    if (best < 0 || recent[variant] > recent[best]) best = variant;
                }
                if (best >= 0) return best;
            }
            // Its own counter, not the frame number: with a shared one the stride and the list
            // length share a factor and exploration keeps revisiting the same two variants.
            explored += 1;
            return explored % VARIANTS.length;
        },
        /**
         * Records how well a variant did, so the next choice can follow it
         *
         * @param variant
         * @param score
         */
        record(variant: number, score: number): void {
            recent[variant % VARIANTS.length] = score;
        },
        /**
         * Forgets what it learned, for when the card changes
         */
        reset(): void {
            recent.fill(-1);
            frame = -1;
            explored = -1;
        },
    };
}

/**
 * Follows whichever crop variant is currently working
 */
export type VariantSelector = {
    /**
     * Picks the variant for the next frame
     *
     * @returns an index into the variant list
     */
    next(): number;
    /**
     * Records how well a variant did
     *
     * @param variant
     * @param score
     */
    record(variant: number, score: number): void;
    /** Forgets what it learned, for when the card changes */
    reset(): void;
};

/**
 * Tracks agreement over a sliding window, which is what gates the expensive half.
 *
 * @returns a tracker that reports when a candidate has come up often enough
 */
export function createAgreementTracker(): AgreementTracker {
    let window: { id: string | null; score: number; named: boolean }[] = [];
    return {
        /**
         * Records this frame's leader and reports whether the window agrees
         *
         * @param id
         * @param score
         * @param named
         * @returns whether it recurs and no rival in the window scored better
         */
        seen(id: string | null, score: number, named: boolean): boolean {
            window.push({ id, score, named });
            if (window.length > AGREEMENT_WINDOW) window.shift();
            if (id === null) return false;

            // A reading of the card beats a resemblance to it, and numbers only settle ties among
            // equals. The two are not the same quantity: a name-restricted search ranks a handful
            // of printings, a full search ranks 111k rows, and on a foil the right printing scored
            // 0.336 among its namesakes while an unrelated card scored 0.644 across the index.
            // Comparing them by number alone would rule out exactly the answer the name found.
            let hits = 0;
            let beaten = false;
            for (const entry of window) {
                if (entry.id === id) hits += 1;
                else if (entry.id !== null && (entry.named !== named ? entry.named : entry.score > score)) {
                    beaten = true;
                }
            }
            return hits >= AGREEMENT_HITS && !beaten;
        },
        /**
         * Forgets the window
         */
        reset(): void {
            window = [];
        },
    };
}
