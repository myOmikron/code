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
import type { CardQuad, DetectedCard, Point, RgbaImage } from "./card-detect";
import type { EmbeddingIndex, IndexMatch } from "./embedding-index";
import type { Embedder } from "./embedder";
import { describeCard, discriminatePrintings, verifyAgainst } from "./feature-verify";
import type { CardFeatures } from "./feature-verify";
import { loadReader } from "./ocr";
import type { ScanLanguage, ScanLanguageChoice } from "./ocr";
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
/**
 * Slack around the guide, and no more than the detector actually needs.
 *
 * It cannot be 1. `card-detect` throws away any quad that spans 95% of the searched area in both
 * directions, because that is what the border of the picture itself looks like, so a region cut
 * exactly to the guide would disqualify the very card sitting in it. At 1.12 the card spans 89%
 * and stays clear of that rule.
 *
 * It should not be much more either, and it was: at 1.25 the searched area covered nearly the
 * whole visible picture while the drawn frame covered a third of it. Everything between the two
 * was searched without being marked, which is how a card box, a sleeve stack and the neighbouring
 * pile end up competing with the card someone is actually holding up. Marking one area and
 * searching another is worse than either alone.
 */
const GUIDE_MARGIN = 1.12;
/** How many printings the embedding hands to verification. Fewer than the bench uses, on purpose. */
const LIVE_SHORTLIST = 6;
/** Printings of a read name handed to verification, ahead of what the picture proposed. */
const NAMED_CANDIDATES = 6;
/**
 * How many printings of one name verification will take on without the model's help.
 *
 * A name is usually the whole answer: 42% of the catalogue's names have exactly one printing and
 * 94% have eight or fewer, and verification decides among a handful by matching features, which
 * needs no ranking at all. Past that the tail gets long — one name has 898 printings — and
 * handing verification an arbitrary six of them is worse than useless, so those are the frames
 * where a model run earns its second. It is also the case the model is best at: on a foil whose
 * correct printing sat at rank 1224 of 111k, ranking it against its own namesakes put it first.
 */
const NAMED_WITHOUT_MODEL = 8;
/** Trims tried when reading the title: as detected, then pulled in far enough to clear a sleeve. */
const OCR_INSETS = [0, 0.04];
/**
 * The scripts auto-detection walks, most printings first.
 *
 * Latin leads because it covers six languages and most of the catalogue, and because its model is
 * the one already on the device. The rest are only ever loaded once a card has actually defeated
 * the current guess, which is what keeps a Latin-only collection from downloading ninety megabytes
 * of Japanese, Chinese, Korean and Russian traineddata it will never read.
 */
const SCRIPTS: ScanLanguage[] = ["en", "ja", "zhs", "zht", "ko", "ru"];
/**
 * Frames the current guess may fail before the next script is tried.
 *
 * Frames arrive every 200 ms, so this is about a second of a card being held up and not read: long
 * enough that a blurred or half-covered Latin card does not send the scanner off downloading a
 * Japanese model, short enough that a genuine Japanese card is reached within a few seconds.
 */
const SCRIPT_PATIENCE = 6;

/** What auto-detection currently believes it is reading, and how long that has been failing. */
let guessed: ScanLanguage = "en";
let misses = 0;
/** The last script that actually produced a name, which is where a fruitless search returns to. */
let settled: ScanLanguage = "en";
/** Scripts tried since the last success, so the walk stops after one lap instead of looping. */
let tried = 0;
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
 * @returns whether the crop is upright, and so may be settled on and may vote
 */
export const uprightVariant = (variant: number): boolean => VARIANTS[variant].rotation === 0;
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
 * The frame that is drawn and searched, in frame coordinates.
 *
 * One rectangle, not two. Marking a card-shaped guide and then searching a quarter more around it
 * meant everything between the two was examined without being shown: a card box, a stack of
 * sleeves and the neighbouring pile all competed with the card being held up, and none of them
 * were anywhere near the frame the user was aiming at.
 *
 * @param width of the frame
 * @param height of the frame
 * @param viewAspect width over height of the element showing the frame, 0 when unknown
 * @returns the region to search
 */
export function guideRegion(width: number, height: number, viewAspect = 0): Region {
    return centred(width, height, GUIDE_MARGIN, viewAspect);
}

/**
 * A centred card-shaped rectangle, sized against what the viewer can actually see.
 *
 * `object-cover` crops the frame to the element's aspect, so a landscape camera in a portrait
 * phone shows about a third of its width. Sizing against the whole frame put both rectangles
 * partly outside the picture.
 *
 * @param width the frame's width
 * @param height the frame's height
 * @param margin how much larger than the guide the rectangle should be
 * @param viewAspect width over height of the element showing the frame, 0 when unknown
 * @returns the rectangle, in frame pixels
 */
function centred(width: number, height: number, margin: number, viewAspect: number): Region {
    const visibleWidth = viewAspect > 0 ? Math.min(width, height * viewAspect) : width;
    const visibleHeight = viewAspect > 0 ? Math.min(height, width / viewAspect) : height;
    const guideHeight = Math.min(visibleHeight * GUIDE_HEIGHT_FRACTION, visibleWidth * 0.78 * (88 / 63));
    const guideWidth = guideHeight * (63 / 88);
    const boxHeight = Math.min(visibleHeight, guideHeight * margin);
    const boxWidth = Math.min(visibleWidth, guideWidth * margin);
    return {
        x: Math.round((width - boxWidth) / 2),
        y: Math.round((height - boxHeight) / 2),
        width: Math.round(boxWidth),
        height: Math.round(boxHeight),
    };
}

/**
 * The guide rectangle as a card, for frames where detection found nothing.
 *
 * Card-shaped and centred in the searched area, which is exactly where the drawn frame sits: the
 * searched area is that frame grown by {@link GUIDE_MARGIN} so the detector has background to find
 * an edge against, and undoing that growth lands back on what the user was aiming at.
 *
 * @param width of the searched area
 * @param height of the searched area
 * @returns a card covering the guide
 */
function guideCard(width: number, height: number): DetectedCard {
    const inset = (1 - 1 / GUIDE_MARGIN) / 2;
    const left = width * inset;
    const right = width - left;
    const top = height * inset;
    const bottom = height - top;
    return {
        quad: {
            topLeft: { x: left, y: top },
            topRight: { x: right, y: top },
            bottomRight: { x: right, y: bottom },
            bottomLeft: { x: left, y: bottom },
        },
        areaFraction: 1 / (GUIDE_MARGIN * GUIDE_MARGIN),
        score: 0,
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
    /** The frame that is both drawn and searched */
    region: Region;
    /** Whether the crop came from the guide because detection found nothing */
    fromGuide: boolean;
    milliseconds: number;
    timings: FrameTimings;
    /** What the title bar read, empty when nothing legible was found */
    title: string;
    /** Why reading failed, empty when it did not */
    ocrError: string;
    /** Which traineddata read the title, so a wrong language is visible rather than guessed at */
    ocrModel: string;
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
 * @param language which language of card is being held up
 * @param sets set codes the scan is narrowed to, empty for all
 * @param viewAspect width over height of the element showing the picture
 * @returns the best candidates and the crops they came from
 */
export async function previewFrame(
    pixels: RgbaImage,
    index: EmbeddingIndex,
    embedder: Embedder,
    variantIndex: number,
    language: ScanLanguageChoice = "auto",
    sets: string[] = [],
    viewAspect = 0,
): Promise<FramePreview> {
    const started = performance.now();
    const timings: FrameTimings = { detect: 0, embed: 0, search: 0, ocr: 0 };

    const region = guideRegion(pixels.width, pixels.height, viewAspect);
    const searched = cutRegion(pixels, region);
    const detected = await detectCardsIn(searched, { maxCards: 1, workingSize: LIVE_WORKING_SIZE });
    timings.detect = performance.now() - started;
    // A card the detector could not find is not the same as a card that is not there: a black
    // border on a dark table, a sleeve catching the light, a thumb over one corner. The frame has
    // already cost its detection, and the guide is the one place the user was asked to put the
    // card, so cropping that rectangle turns a discarded frame into one more chance at an answer.
    // Marked as such, because a guessed crop is worth knowing about when the answer is wrong.
    const fromGuide = detected.length === 0;
    const card = fromGuide ? guideCard(searched.width, searched.height) : detected[0];
    const variant = VARIANTS[variantIndex % VARIANTS.length];
    const quad = variant.inset === 0 ? card.quad : shrinkQuad(card.quad, variant.inset);
    const crop = await rectifyCardIn(searched, quad, variant.rotation);

    // Border, then name, then the model only if the name was not enough. The order is the whole
    // frame budget: reading the title costs around 70 ms against the better part of a second for
    // one model run, and a name is usually the entire answer — 42% of the catalogue's names have
    // exactly one printing and 94% have eight or fewer. Verification decides among a handful by
    // matching features, so for those there is nothing left for a ranking to do.
    // Its own crops, upright, rather than whatever the variant selector happens to be trying this
    // frame. The variants exist to feed the model, and two of the four are useless to a reader:
    // the rotated ones put the title at the bottom upside down. Tying the reading to that lottery
    // is how a legible card came back as "Ge Ly".
    //
    // Both trims are tried because neither is right twice. A quad that landed on the sleeve needs
    // trimming to reach the card; one already tight on the card is pushed off its own title bar by
    // the same trim, since the strip is cut at a fraction of the crop's height. Over 24 photographs
    // the untrimmed crop read 13 names and the trimmed one 5 — and the two together read 16, which
    // is the point: they fail on different cards. The second pass only runs when the first found
    // nothing, and costs a fraction of the model run it is trying to avoid.
    const ocrStarted = performance.now();
    let title = "";
    let resolved = "";
    const readingLanguage = language === "auto" ? guessed : language;
    for (const inset of OCR_INSETS) {
        const reading = await readName(
            readingLanguage,
            await rectifyCardIn(searched, inset === 0 ? card.quad : shrinkQuad(card.quad, inset), 0),
        );
        if (!title) title = reading;
        resolved = reading ? index.resolveName(reading) : "";
        if (resolved) {
            title = reading;
            break;
        }
    }
    // One script at a time, and only after the current one has had its chance. Trying them all in
    // a single frame would mean six model loads and two seconds before anything appeared on
    // screen; walking them costs one extra guess per second and settles on the right one for the
    // rest of the stack.
    if (language === "auto") {
        if (resolved) {
            misses = 0;
            tried = 0;
            settled = guessed;
        } else if ((misses += 1) >= SCRIPT_PATIENCE) {
            misses = 0;
            // One lap and no further. A card the scanner cannot read at all looks exactly like a
            // card in an unexpected script, and a borderless Secret Lair walked the search through
            // every model on the list, downloading each of them for nothing. After a full lap it
            // goes back to whatever last worked and waits there rather than keeping shopping.
            if ((tried += 1) >= SCRIPTS.length) {
                tried = 0;
                guessed = settled;
            } else {
                guessed = SCRIPTS[(SCRIPTS.indexOf(guessed) + 1) % SCRIPTS.length];
            }
        }
    }
    timings.ocr = performance.now() - ocrStarted;

    /**
     * Runs the model and projects the result, for the branches that still need it
     *
     * @returns the projected query vector
     */
    const embedded = async (): Promise<Float32Array> => {
        const embedStarted = performance.now();
        const vector = await embedder.embed(crop);
        timings.embed = performance.now() - embedStarted;
        return index.project(vector);
    };

    let byName: IndexMatch[] = [];
    let bySight: IndexMatch[] = [];
    const searchStarted = performance.now();
    if (resolved && index.countNamed(resolved) <= NAMED_WITHOUT_MODEL) {
        // Nothing to rank against, and nothing to rank: *all* the printings of this name go to
        // verification as they are. Trimming them to the usual shortlist would be picking six of
        // eight at random, and the two dropped ones are as likely as any to be the right answer.
        byName = index.searchNamed(new Float32Array(index.manifest.dim), resolved, NAMED_WITHOUT_MODEL);
        timings.search = performance.now() - searchStarted;
    } else if (resolved) {
        // The long tail — one name has 898 printings — and the one job the model is reliably good
        // at even when it is struggling: on a foil whose correct printing sat at rank 1224 of
        // 111k, ranking it against its own namesakes put it first by a clear margin.
        byName = index.searchNamed(await embedded(), resolved, NAMED_CANDIDATES);
        timings.search = performance.now() - searchStarted - timings.embed;
    } else {
        bySight = index.search(await embedded(), LIVE_SHORTLIST);
        timings.search = performance.now() - searchStarted - timings.embed;
    }

    // The language the user said they are holding comes first. It is a tiebreak, not a filter:
    // the same card exists in up to eleven languages whose pictures are near identical, so the
    // ranking between them is close to arbitrary, and a Japanese card confirmed as its English
    // printing is the visible result. Wrong guesses cost nothing, since the others stay behind.
    // Two preferences, the narrower one first. A chosen set is an explicit "I am sorting this
    // box", which is a stronger statement than a language; both are preferences rather than
    // filters, so a card from outside the box is still identified and simply ranks behind.
    const wanted = new Set(sets.map((code) => code.toLowerCase()));
    const preferred = (match: IndexMatch) =>
        (wanted.size > 0 && !wanted.has(match.printing.set.toLowerCase()) ? 2 : 0) +
        (match.printing.lang === readingLanguage ? 0 : 1);
    const candidates = [...byName, ...bySight].sort((left, right) => preferred(left) - preferred(right));

    return {
        candidates,
        title,
        ocrError,
        ocrModel,
        named: byName.length > 0,
        sightScore: bySight[0]?.score ?? 0,
        crops: [crop],
        // Not reported when it came from the guide. The overlay draws whatever quad it is given,
        // and an outline around the guide would claim a card was found there when none was.
        quad: fromGuide ? null : offsetQuad(card.quad, region),
        areaFraction: card.areaFraction,
        region,
        fromGuide,
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
let ocrModel = "";

/**
 * Reads the card's name, returning nothing rather than failing when OCR is unavailable.
 *
 * @param language which language of card is being held up, which picks the model
 * @param crop a rectified card
 * @returns the name, or an empty string
 */
async function readName(language: ScanLanguage, crop: RgbaImage): Promise<string> {
    try {
        const reader = await loadReader(language);
        ocrModel = reader.model;
        const name = await reader.readTitle(crop);
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
         * @param steady whether the last frame read a name, which leaves nothing to explore for
         * @returns an index into the variant list
         */
        next(steady = false): number {
            frame += 1;
            // Nothing to explore while the title is being read. The variants exist to find a crop
            // the model likes, and with a resolved name the model is not the one answering: the
            // crop no longer decides which card this is, so trying another one only costs a frame
            // that cannot agree with its neighbours.
            if (steady || frame % EXPLORE_EVERY !== 0) {
                let best = -1;
                for (let variant = 0; variant < VARIANTS.length; variant += 1) {
                    if (!uprightVariant(variant) || recent[variant] < 0) continue;
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
     * @param steady whether the last frame read a name, which leaves nothing to explore for
     * @returns an index into the variant list
     */
    next(steady?: boolean): number;
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
            // A frame that found no card is not evidence about which card this is, so it does not
            // take a place in the window. It used to: with four places and a hand-held card that
            // drops out of detection every other frame, the two agreeing frames were pushed apart
            // before they could ever be counted together, and the panel said the frames did not
            // agree when in truth they had never been in the room at the same time.
            if (id === null) return false;

            window.push({ id, score, named });
            if (window.length > AGREEMENT_WINDOW) window.shift();

            // A reading of the card beats a resemblance to it, and numbers only settle ties among
            // equals. The two are not the same quantity: a name-restricted search ranks a handful
            // of printings, a full search ranks 111k rows, and on a foil the right printing scored
            // 0.336 among its namesakes while an unrelated card scored 0.644 across the index.
            // Comparing them by number alone would rule out exactly the answer the name found.
            const tally = new Map<string, { hits: number; score: number; named: boolean }>();
            for (const entry of window) {
                if (entry.id === null) continue;
                const held = tally.get(entry.id);
                if (held) held.hits += 1;
                else tally.set(entry.id, { hits: 1, score: entry.score, named: entry.named });
            }

            const hits = tally.get(id)?.hits ?? 0;
            // A rival has to be at least as well attested before it counts as beating anything.
            // Any single better-scoring frame used to veto outright, so one stray reading in four
            // held up an answer that the other three agreed on, and the card had to be presented
            // again from scratch.
            let beaten = false;
            for (const [other, stats] of tally) {
                if (other === id) continue;
                // A name read off the card still wins outright, however rarely it turned up: the
                // two quantities are not comparable, and on a foil the right printing scored 0.336
                // among its namesakes while an unrelated card scored 0.644 across the whole index.
                if (stats.named !== named) {
                    if (stats.named) beaten = true;
                    continue;
                }
                // Between equals, though, a rival has to be at least as well attested. A single
                // better-scoring frame used to veto outright, so one stray reading in four held up
                // an answer the other three agreed on and the card had to be presented again.
                if (stats.hits >= hits && stats.score > score) beaten = true;
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
