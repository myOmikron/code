//! Finds Magic cards in a camera frame and rectifies them into the canonical reference frame.
//!
//! Everything downstream of this module assumes a card that has been perspective-corrected to
//! exactly the geometry of a Scryfall `normal` scan. That is what makes fixed-position crops
//! (set symbol, collector line, title bar) meaningful and what lets a camera photo and a
//! reference image be compared at all.
//!
//! The 180° ambiguity is deliberately not resolved here: a card photographed upside down
//! produces a valid quad whose "top" edge is the bottom of the card. `rectifyCard` therefore
//! takes the orientation as a parameter and the matching stage scores both.
//!
//! The functions taking an {@link RgbaImage} are the real implementation and are free of DOM
//! types, which is what lets the Node harness in test/ exercise the same code the app runs.
import { loadOpenCv, withMats } from "./opencv";
import type { OpenCv } from "./opencv";
import { houghQuads } from "./hough-quads";

/**
 * A Mat, as constructed by the loaded OpenCV runtime
 */
type Mat = InstanceType<OpenCv["Mat"]>;

/**
 * Raw RGBA pixels. `ImageData` satisfies this structurally.
 */
export type RgbaImage = { data: Uint8ClampedArray; width: number; height: number };

/**
 * A point in the coordinate system of the source image
 */
export type Point = { x: number; y: number };

/**
 * The four corners of a detected card, clockwise from the card's top left
 */
export type CardQuad = {
    topLeft: Point;
    topRight: Point;
    bottomRight: Point;
    bottomLeft: Point;
};

/**
 * One detected card
 */
export type DetectedCard = {
    /** Corners in source-image coordinates */
    quad: CardQuad;
    /** How much of the frame the card covers, 0 to 1 */
    areaFraction: number;
    /** Combined shape plausibility, 0 to 1; higher is more card-like */
    score: number;
};

/**
 * Knobs for {@link detectCardsIn}
 */
export type DetectOptions = {
    /** Long side the frame is downscaled to before edge detection */
    workingSize?: number;
    /** Smallest fraction of the frame a card may cover */
    minAreaFraction?: number;
    /** Upper bound on returned cards, best score first */
    maxCards?: number;
    /** Receives every candidate before inner-frame and overlap suppression, for diagnostics */
    onCandidates?: (candidates: DetectedCard[], source: string) => void;
    /** Receives how many quads each gate discarded, for diagnostics */
    onRejects?: (counts: Record<string, number>) => void;
};

/** Physical Magic card, 63 mm × 88 mm. */
const CARD_ASPECT = 63 / 88;
/**
 * Widest and narrowest *projected* aspect a quad may have to still be worth examining.
 *
 * Deliberately loose. Perspective moves this ratio a long way, a card seen from thirty degrees
 * above reads as 0.84, so a tight bound here throws away real cards. {@link rectangleScore} does
 * the actual judging, on the recovered proportions rather than the projected ones; this only
 * rejects shapes that cannot be a card under any plausible viewing angle.
 */
const ASPECT_TOLERANCE = 0.5;
/** Smallest ratio between two opposite sides; below this the quad is a trapezoid, not a card. */
const MIN_SIDE_SYMMETRY = 0.62;
/** Smallest share of its bounding quad a contour must fill to count as a rectangle. */
const MIN_RECTANGULARITY = 0.75;
/** Multipliers applied to the Otsu level to pool candidates from several edge sensitivities. */
const CANNY_FACTORS = [0.6, 1, 1.6];
/** Area fraction above which a detection gets no further size bonus. */
const AREA_SATURATION = 0.25;
/** Centre distance, relative to the larger quad's size, below which two detections are the same card. */
const OVERLAP_REACH = 0.55;
/**
 * Share of the frame a quad may span in both directions before it is taken to be the frame.
 *
 * The image border is a rectangle too, and `findContours` returns it. Preferring the larger of
 * two overlapping quads then makes the whole photo beat every card in it, which is not obvious
 * from the result: with the card near the middle, the rectified frame still looks card-like.
 * A card lying on a table does not reach all four edges, so spanning both axes disqualifies it.
 */
const FRAME_SPAN_FRACTION = 0.95;
/**
 * Most an enclosing quad may exceed the one inside it and still be preferred.
 *
 * A card's illustration box is roughly a third of the card, so the card is under three times its
 * area. Anything much larger that merely happens to contain a card is a table, a mat or the
 * photo itself. Without this bound, containment always promotes the biggest blob in the frame,
 * because every card is inside everything around it.
 */
const MAX_ENCLOSING_GROWTH = 3.5;
/**
 * Least of the enclosed quad's score an enclosing one must reach to replace it.
 *
 * Containment and size alone are not enough. An illustration box loses to its card by a modest
 * margin, so the rule may prefer a somewhat weaker outer quad, but without a floor it will just
 * as happily hand the result to a shapeless blob that scored zero and merely happens to be
 * bigger and to contain the card.
 */
const MIN_ENCLOSING_SCORE_RATIO = 0.2;
/** Tolerance on the *recovered* aspect ratio, which is far tighter than on the projected one. */
const RECOVERED_TOLERANCE = 0.16;
/**
 * Below this deviation of the projective factors from one, the quad is treated as affine.
 *
 * The recovery divides by those deviations, so a card lying flat and photographed almost
 * head-on, where perspective is weak, makes it numerically explosive and its sign unstable.
 * That regime is exactly where the projected side ratio is accurate anyway, so it is used there.
 */
const AFFINE_THRESHOLD = 0.02;
/**
 * Focal length assumed when the quad itself cannot reveal it, as a fraction of the image diagonal.
 *
 * A card rotated about a single axis leaves one set of edges parallel, and a single vanishing
 * point does not determine the camera. Falling back to the projected side ratio is wrong there:
 * that ratio is exactly what perspective distorted, and a card photographed from thirty degrees
 * above reads as 0.84 instead of 0.716, which any sane tolerance then rejects. Phone cameras sit
 * close enough together that assuming a focal length recovers the true proportions far better
 * than ignoring perspective altogether. The value corresponds to roughly a 70° diagonal field.
 */
const ASSUMED_FOCAL_FRACTION = 1 / 1.4;
/** Below this, two corners are effectively the same point and the quad is degenerate. */
const DEGENERATE_EPSILON = 1e-7;
/**
 * Tilt of the card's top edge, in degrees, at which a detection stops counting as upright.
 *
 * Cards are photographed lying roughly the same way up as the camera is held; a card turned a
 * quarter circle on the table is not how anyone scans. A quad whose short sides run vertically
 * in the image is therefore almost always a landscape piece *inside* a card, most often the
 * illustration box, which {@link orderCorners} then stands upright and which no proportion test
 * can distinguish from a card afterwards. Judging the tilt before that rotation happens is what
 * catches it.
 */
const MAX_TILT_DEGREES = 42;
/** Samples taken along each side when measuring border contrast. */
const BORDER_SAMPLES = 24;
/** Perpendicular offset, in working pixels, at which the inside and outside are sampled. */
const BORDER_OFFSET = 5;
/** Intensity step across an edge that counts as a real boundary. */
const BORDER_STEP = 16;
/** Share of a side's samples that must show a step for the side to count as an edge. */
const MIN_BORDER_CONTRAST = 0.45;

/** Geometry of a Scryfall `normal` image, which every rectified card is warped onto. */
export const RECTIFIED_WIDTH = 488;
export const RECTIFIED_HEIGHT = 680;

const DEFAULTS: Required<Omit<DetectOptions, "onCandidates" | "onRejects">> = {
    workingSize: 720,
    minAreaFraction: 0.02,
    maxCards: 8,
};

/**
 * Rejects quads carrying non-finite coordinates, which degenerate contours can produce
 *
 * @param quad
 * @returns
 */
function hasFiniteCorners(quad: CardQuad): boolean {
    return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    );
}

/**
 * Mild preference for larger detections, flat above {@link AREA_SATURATION}.
 *
 * A card filling a quarter of the frame is already unambiguous, and rewarding size beyond that
 * is what lets a table-sized background blob outrank the card sitting on it.
 *
 * @param areaFraction
 * @param minAreaFraction
 * @returns a factor between 0 and 1
 */
function areaPrior(areaFraction: number, minAreaFraction: number): number {
    const span = Math.max(AREA_SATURATION - minAreaFraction, 1e-6);
    return 0.55 + 0.45 * Math.min(1, Math.max(0, (areaFraction - minAreaFraction) / span));
}

/**
 * How much of a quad's outline sits on a real intensity boundary, judged side by side.
 *
 * This is the one thing shape cannot express. {@link orderCorners} turns every quad upright, so
 * a landscape rectangle of table and card interior becomes card-shaped on paper and rectifies
 * into a card turned by ninety degrees. What separates it from a card is that a card differs
 * from its surroundings along its *entire* outline, while such a rectangle crosses the card in
 * the middle, where inside and outside look the same.
 *
 * The step must keep the same sign along a side. A card is darker than its surroundings all the
 * way round, or lighter all the way round; wood grain and fabric produce just as many steps but
 * in random directions, and counting those was enough to let a quad with two sides lying on a
 * bare table pass. Which of the two signs wins is not fixed, so a dark card on a bright table
 * and a bright card on a dark mat both work.
 *
 * @param quad in working coordinates
 * @param grey single-channel pixels of the working image
 * @param width of the working image
 * @param height of the working image
 * @returns the weakest side's share of samples showing a step, 0 to 1
 */
function borderContrast(quad: CardQuad, grey: Uint8Array, width: number, height: number): number {
    const sample = (x: number, y: number): number | null => {
        const px = Math.round(x);
        const py = Math.round(y);
        if (px < 0 || py < 0 || px >= width || py >= height) return null;
        return grey[py * width + px];
    };

    const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
    const centre = {
        x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
        y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
    };

    let weakest = 1;
    for (let side = 0; side < 4; side += 1) {
        const from = corners[side];
        const to = corners[(side + 1) % 4];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length < 1) return 0;

        let normalX = -dy / length;
        let normalY = dx / length;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        if (
            (midX + normalX - centre.x) ** 2 + (midY + normalY - centre.y) ** 2 <
            (midX - centre.x) ** 2 + (midY - centre.y) ** 2
        ) {
            normalX = -normalX;
            normalY = -normalY;
        }

        let darker = 0;
        let lighter = 0;
        let counted = 0;
        for (let index = 1; index <= BORDER_SAMPLES; index += 1) {
            const t = index / (BORDER_SAMPLES + 1);
            const x = from.x + dx * t;
            const y = from.y + dy * t;
            const outside = sample(x + normalX * BORDER_OFFSET, y + normalY * BORDER_OFFSET);
            const inside = sample(x - normalX * BORDER_OFFSET, y - normalY * BORDER_OFFSET);
            if (outside === null || inside === null) continue;
            counted += 1;
            if (inside - outside < -BORDER_STEP) darker += 1;
            else if (inside - outside > BORDER_STEP) lighter += 1;
        }
        if (counted === 0) return 0;
        weakest = Math.min(weakest, Math.max(darker, lighter) / counted);
        if (weakest === 0) return 0;
    }
    return weakest;
}

/**
 * True when a quad reaches across the whole frame in both directions, which makes it the image
 * border rather than anything lying in the picture
 *
 * @param quad in working coordinates
 * @param width of the working image
 * @param height of the working image
 * @returns
 */
function spansFrame(quad: CardQuad, width: number, height: number): boolean {
    const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
    const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    return spanX > width * FRAME_SPAN_FRACTION && spanY > height * FRAME_SPAN_FRACTION;
}

/**
 * Distance between two points
 *
 * @param a
 * @param b
 * @returns
 */
function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Area of a quad
 *
 * @param quad
 * @returns
 */
function quadArea(quad: CardQuad): number {
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
    const doubled = points.reduce((sum, point, index) => {
        const next = points[(index + 1) % 4];
        return sum + (point.x * next.y - next.x * point.y);
    }, 0);
    return Math.abs(doubled) / 2;
}

/**
 * Maps a quad into a coordinate system scaled by `factor`
 *
 * @param quad
 * @param factor
 * @returns
 */
function scaleQuad(quad: CardQuad, factor: number): CardQuad {
    const apply = (point: Point) => ({ x: point.x * factor, y: point.y * factor });
    return {
        topLeft: apply(quad.topLeft),
        topRight: apply(quad.topRight),
        bottomRight: apply(quad.bottomRight),
        bottomLeft: apply(quad.bottomLeft),
    };
}

/**
 * Moves a quad's corners towards its centre by a fraction of its size.
 *
 * A card in a sleeve is detected at the sleeve's edge, not its own, which leaves the card inset
 * by a few percent inside the rectified frame. The embedding is sensitive to that: the same card
 * scores 0.67 against its reference when rectified to the sleeve and 0.82 when trimmed by five
 * percent. Sleeve thickness is not known in advance, so the caller tries a small set of values
 * and lets the index pick.
 *
 * @param quad
 * @param fraction how far to move each corner in, 0 to 0.5
 * @returns the shrunk quad
 */
export function shrinkQuad(quad: CardQuad, fraction: number): CardQuad {
    const centre = {
        x: (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4,
        y: (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4,
    };
    const scale = 1 - 2 * fraction;
    const apply = (point: Point) => ({
        x: centre.x + (point.x - centre.x) * scale,
        y: centre.y + (point.y - centre.y) * scale,
    });
    return {
        topLeft: apply(quad.topLeft),
        topRight: apply(quad.topRight),
        bottomRight: apply(quad.bottomRight),
        bottomLeft: apply(quad.bottomLeft),
    };
}

/**
 * Orders four unsorted corners into a clockwise quad starting at the card's top left.
 *
 * The two shorter opposite sides are the card's top and bottom; of those the one further up in
 * the image is taken as the top. That leaves the 180° ambiguity the module doc describes.
 *
 * @param points exactly four corners in arbitrary order
 * @returns the quad, or null if the points are degenerate
 */
export function orderCorners(points: Point[]): CardQuad | null {
    if (points.length !== 4) return null;

    const centre = {
        x: points.reduce((sum, point) => sum + point.x, 0) / 4,
        y: points.reduce((sum, point) => sum + point.y, 0) / 4,
    };
    const cyclic = [...points].sort(
        (a, b) => Math.atan2(a.y - centre.y, a.x - centre.x) - Math.atan2(b.y - centre.y, b.x - centre.x),
    );

    const sides = cyclic.map((point, index) => distance(point, cyclic[(index + 1) % 4]));
    if (sides.some((side) => side < 1)) return null;

    const shortPair = sides[0] + sides[2] <= sides[1] + sides[3] ? 0 : 1;
    const midY = (index: number) => (cyclic[index % 4].y + cyclic[(index + 1) % 4].y) / 2;
    const start = midY(shortPair) <= midY(shortPair + 2) ? shortPair : shortPair + 2;

    const ordered = [0, 1, 2, 3].map((offset) => cyclic[(start + offset) % 4]);
    const signedArea = ordered.reduce((sum, point, index) => {
        const next = ordered[(index + 1) % 4];
        return sum + (point.x * next.y - next.x * point.y);
    }, 0);
    const clockwise = signedArea > 0 ? ordered : [ordered[0], ordered[3], ordered[2], ordered[1]];

    return {
        topLeft: clockwise[0],
        topRight: clockwise[1],
        bottomRight: clockwise[2],
        bottomLeft: clockwise[3],
    };
}

/**
 * The four side lengths of a quad, as opposite pairs
 *
 * @param quad
 * @returns
 */
function sideLengths(quad: CardQuad): { top: number; bottom: number; left: number; right: number } {
    return {
        top: distance(quad.topLeft, quad.topRight),
        bottom: distance(quad.bottomLeft, quad.bottomRight),
        left: distance(quad.topLeft, quad.bottomLeft),
        right: distance(quad.topRight, quad.bottomRight),
    };
}

/**
 * Recovers the width-to-height ratio of the rectangle a quad would be a perspective view of.
 *
 * Measuring the projected side lengths, which {@link aspectScore} does, cannot tell a tilted
 * card from a skewed patch of table: perspective changes both, and the average hides it. This
 * asks the stricter question instead. Under a pinhole camera with the principal point at the
 * image centre, four corners determine both the focal length and the original rectangle's
 * proportions, and a quad that is not the image of any rectangle produces a negative squared
 * focal length and is rejected outright.
 *
 * The method is Zhang and He's, from whiteboard rectification. The parallelogram case, where the
 * camera cannot be recovered because the vanishing points are at infinity, falls back to the
 * projected ratio, which is exact there.
 *
 * @param quad in image coordinates
 * @param width of the image the quad was found in
 * @param height of the image the quad was found in
 * @returns the recovered ratio, or null when the quad cannot be a rectangle
 */
export function recoverAspectRatio(quad: CardQuad, width: number, height: number): number | null {
    const centreX = width / 2;
    const centreY = height / 2;
    const toHomogeneous = (point: Point): [number, number, number] => [point.x - centreX, point.y - centreY, 1];
    const m1 = toHomogeneous(quad.topLeft);
    const m2 = toHomogeneous(quad.topRight);
    const m3 = toHomogeneous(quad.bottomLeft);
    const m4 = toHomogeneous(quad.bottomRight);

    const cross = (a: number[], b: number[]): number[] => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    const m1m4 = cross(m1, m4);
    const denominator2 = dot(cross(m2, m4), m3);
    const denominator3 = dot(cross(m3, m4), m2);
    if (Math.abs(denominator2) < DEGENERATE_EPSILON || Math.abs(denominator3) < DEGENERATE_EPSILON) return null;

    const k2 = dot(m1m4, m3) / denominator2;
    const k3 = dot(m1m4, m2) / denominator3;
    const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
    const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];

    const conditioning = Math.min(Math.abs(k2 - 1), Math.abs(k3 - 1));
    const recovered = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
    const assumed = (Math.hypot(width, height) * ASSUMED_FOCAL_FRACTION) ** 2;
    const focalSquared =
        conditioning >= AFFINE_THRESHOLD && Number.isFinite(recovered) && recovered > 0 ? recovered : assumed;

    const horizontal = (n2[0] * n2[0] + n2[1] * n2[1]) / focalSquared + n2[2] * n2[2];
    const vertical = (n3[0] * n3[0] + n3[1] * n3[1]) / focalSquared + n3[2] * n3[2];
    if (vertical <= DEGENERATE_EPSILON || horizontal <= DEGENERATE_EPSILON) return null;
    return Math.sqrt(horizontal / vertical);
}

/**
 * How close the recovered rectangle's proportions are to a Magic card, 0 to 1.
 *
 * @param quad
 * @param width of the image the quad was found in
 * @param height of the image the quad was found in
 * @returns 0 when the quad cannot be a card-shaped rectangle at all
 */
export function rectangleScore(quad: CardQuad, width: number, height: number): number {
    const ratio = recoverAspectRatio(quad, width, height);
    if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return 0;
    return Math.max(0, 1 - Math.abs(ratio - CARD_ASPECT) / RECOVERED_TOLERANCE);
}

/**
 * How upright a detection stands, 0 to 1, measured on the edge taken to be the card's top.
 *
 * @param quad
 * @returns 0 once the top edge is tilted by {@link MAX_TILT_DEGREES} or more
 */
export function uprightScore(quad: CardQuad): number {
    const top = { x: quad.topRight.x - quad.topLeft.x, y: quad.topRight.y - quad.topLeft.y };
    const bottom = { x: quad.bottomRight.x - quad.bottomLeft.x, y: quad.bottomRight.y - quad.bottomLeft.y };
    const angle = (edge: { x: number; y: number }) => {
        const degrees = (Math.atan2(edge.y, edge.x) * 180) / Math.PI;
        const folded = ((degrees % 180) + 180) % 180;
        return folded > 90 ? 180 - folded : folded;
    };
    const tilt = (angle(top) + angle(bottom)) / 2;
    return Math.max(0, 1 - tilt / MAX_TILT_DEGREES);
}

/**
 * How close a quad's proportions are to a Magic card, 0 to 1.
 *
 * @param quad
 * @returns
 */
export function aspectScore(quad: CardQuad): number {
    const { top, bottom, left, right } = sideLengths(quad);
    const width = (top + bottom) / 2;
    const height = (left + right) / 2;
    if (height < 1) return 0;
    return Math.max(0, 1 - Math.abs(width / height - CARD_ASPECT) / ASPECT_TOLERANCE);
}

/**
 * How rectangular a quad is, 0 to 1, judged by how equal its opposite sides are.
 *
 * A card seen at an angle stays a near-parallelogram: perspective shortens one side pair by a
 * few percent, not by half. Background clutter, by contrast, produces wildly asymmetric
 * trapezoids that pass a plain aspect test because that test averages the two sides away.
 *
 * @param quad
 * @returns
 */
export function symmetryScore(quad: CardQuad): number {
    const { top, bottom, left, right } = sideLengths(quad);
    const horizontal = Math.min(top, bottom) / Math.max(top, bottom, 1e-6);
    const vertical = Math.min(left, right) / Math.max(left, right, 1e-6);
    return Math.min(horizontal, vertical);
}

/**
 * Reduces one contour to a four-corner quad.
 *
 * Card corners are rounded, so a fixed `approxPolyDP` epsilon returns five to eight vertices
 * about as often as four. The epsilon is therefore swept from tight to loose and the first
 * value that collapses the hull to a convex quadrilateral wins; the rotated bounding box is
 * the fallback for contours that never do.
 *
 * Note that `boxPoints` returns its corners rather than filling an output Mat, unlike most of
 * the OpenCV.js surface.
 *
 * @param cv
 * @param contour
 * @returns the four corners, or null
 */
function quadFromContour(cv: OpenCv, contour: Mat): Point[] | null {
    return withMats((track) => {
        const hull = track(new cv.Mat());
        cv.convexHull(contour, hull, false, true);
        const perimeter = cv.arcLength(hull, true);
        if (perimeter < 40) return null;

        for (let epsilon = 0.01; epsilon <= 0.07; epsilon += 0.005) {
            const approx = track(new cv.Mat());
            cv.approxPolyDP(hull, approx, epsilon * perimeter, true);
            if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
            const data = approx.data32S;
            return [0, 1, 2, 3].map((index) => ({ x: data[index * 2], y: data[index * 2 + 1] }));
        }

        const corners = cv.boxPoints(cv.minAreaRect(hull));
        return corners.length === 4 ? corners.map((corner) => ({ x: corner.x, y: corner.y })) : null;
    });
}

/**
 * True when `point` lies inside the convex quad
 *
 * @param point
 * @param quad
 * @returns
 */
function isInside(point: Point, quad: CardQuad): boolean {
    const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
    let positive = false;
    let negative = false;
    for (let index = 0; index < 4; index += 1) {
        const from = corners[index];
        const to = corners[(index + 1) % 4];
        const cross = (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
        if (cross > 0) positive = true;
        if (cross < 0) negative = true;
        if (positive && negative) return false;
    }
    return true;
}

/**
 * How many of a quad's corners lie inside another
 *
 * @param inner
 * @param outer
 * @returns 0 to 4
 */
function cornersInside(inner: CardQuad, outer: CardQuad): number {
    return [inner.topLeft, inner.topRight, inner.bottomRight, inner.bottomLeft].filter((corner) =>
        isInside(corner, outer),
    ).length;
}

/**
 * Collapses overlapping detections, preferring the enclosing quad over what sits inside it.
 *
 * A card's illustration box has almost exactly the card's own proportions once
 * {@link orderCorners} has turned it upright, so shape cannot tell them apart, and it has
 * crisper edges than a card in a sleeve so it scores *better*. What does tell them apart is that
 * the inner frame lies inside the card.
 *
 * Containment is counted per corner rather than demanded outright: an inner frame often bleeds a
 * little past the card where the contour ran along a shadow, and a strict test lets those
 * through. Requiring most corners inside keeps that tolerance without promoting an unrelated
 * blob that merely happens to be bigger, which a plain size preference does.
 *
 * @param cards sorted best first
 * @returns one detection per overlapping group
 */
function keepEnclosing(cards: DetectedCard[]): DetectedCard[] {
    const centreOf = (quad: CardQuad) => ({
        x: (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4,
        y: (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4,
    });
    const areas = cards.map((card) => quadArea(card.quad));
    const centres = cards.map((card) => centreOf(card.quad));

    const kept: number[] = [];
    for (let index = 0; index < cards.length; index += 1) {
        const overlapping = kept.findIndex(
            (other) =>
                distance(centres[index], centres[other]) <
                Math.sqrt(Math.max(areas[index], areas[other])) * OVERLAP_REACH,
        );
        if (overlapping === -1) {
            kept.push(index);
            continue;
        }
        const incumbent = kept[overlapping];
        const enclosesIncumbent =
            areas[index] > areas[incumbent] &&
            areas[index] <= areas[incumbent] * MAX_ENCLOSING_GROWTH &&
            cards[index].score >= cards[incumbent].score * MIN_ENCLOSING_SCORE_RATIO &&
            cornersInside(cards[incumbent].quad, cards[index].quad) >= 3;
        if (enclosesIncumbent) kept[overlapping] = index;
    }
    return kept.map((index) => cards[index]);
}

/**
 * Finds every card-shaped quadrilateral in a frame.
 *
 * Edges come from Canny with its thresholds derived from the frame's own Otsu level, which is
 * what keeps detection working across a bright table and a dark sleeve without hand-tuned
 * constants. Contours are searched twice, once on the dilated edge map and once on an Otsu
 * binarisation, because a card on a low-contrast background produces edges too weak for the
 * first pass while a glossy sleeve confuses the second.
 *
 * @param pixels the full-resolution frame
 * @param options
 * @returns detections in `pixels` coordinates, best first
 */
export async function detectCardsIn(pixels: RgbaImage, options: DetectOptions = {}): Promise<DetectedCard[]> {
    const { workingSize, minAreaFraction, maxCards } = { ...DEFAULTS, ...options };
    const { onCandidates, onRejects } = options;
    const rejects: Record<string, number> = {
        klein: 0,
        keinQuad: 0,
        ordnung: 0,
        endlich: 0,
        seitenverhältnis: 0,
        symmetrie: 0,
        kippung: 0,
        füllung: 0,
        flächeKlein: 0,
        bildrahmen: 0,
        randkontrast: 0,
        rechteck: 0,
        angenommen: 0,
    };
    const cv = await loadOpenCv();

    const scale = Math.min(1, workingSize / Math.max(pixels.width, pixels.height));
    const workWidth = Math.max(2, Math.round(pixels.width * scale));
    const workHeight = Math.max(2, Math.round(pixels.height * scale));
    const frameArea = workWidth * workHeight;

    return withMats((track) => {
        const full = track(cv.matFromImageData(pixels));
        const rgba = track(new cv.Mat());
        cv.resize(full, rgba, new cv.Size(workWidth, workHeight), 0, 0, cv.INTER_AREA);

        const gray = track(new cv.Mat());
        cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
        const greyPixels = new Uint8Array(gray.data);
        const blurred = track(new cv.Mat());
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

        const binary = track(new cv.Mat());
        const otsu = cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

        const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
        cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);

        const maps = [binary];
        const cannyMaps: Mat[] = [];
        const addCanny = (channel: Mat, level: number, factors: number[]) => {
            for (const factor of factors) {
                const edges = track(new cv.Mat());
                cv.Canny(channel, edges, Math.max(10, level * factor * 0.5), Math.max(30, level * factor));
                cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
                maps.push(edges);
                cannyMaps.push(edges);
            }
        };
        addCanny(blurred, otsu, CANNY_FACTORS);

        const candidates: DetectedCard[] = [];

        /**
         * Runs one working-coordinate quad through every gate and records it when it passes.
         *
         * @param quad in working coordinates
         * @param quality how well the evidence backs it: contour fill, or line support
         * @param count whether to tally rejections, which only the contour pass reports
         * @returns whether it was accepted
         */
        const consider = (quad: CardQuad, quality: number, count: boolean): boolean => {
            if (!hasFiniteCorners(quad)) {
                if (count) rejects.endlich += 1;
                return false;
            }
            if (aspectScore(quad) <= 0) {
                if (count) rejects.seitenverhältnis += 1;
                return false;
            }
            const symmetry = symmetryScore(quad);
            if (symmetry < MIN_SIDE_SYMMETRY) {
                if (count) rejects.symmetrie += 1;
                return false;
            }
            const upright = uprightScore(quad);
            if (upright <= 0) {
                if (count) rejects.kippung += 1;
                return false;
            }
            const area = quadArea(quad);
            if (area < frameArea * minAreaFraction) {
                if (count) rejects.flächeKlein += 1;
                return false;
            }
            const areaFraction = area / frameArea;
            if (spansFrame(quad, workWidth, workHeight)) {
                if (count) rejects.bildrahmen += 1;
                return false;
            }
            const contrast = borderContrast(quad, greyPixels, workWidth, workHeight);
            if (contrast < MIN_BORDER_CONTRAST) {
                if (count) rejects.randkontrast += 1;
                return false;
            }
            const rectangle = rectangleScore(quad, workWidth, workHeight);
            if (rectangle <= 0) {
                if (count) rejects.rechteck += 1;
                return false;
            }
            if (count) rejects.angenommen += 1;
            candidates.push({
                quad: scaleQuad(quad, 1 / scale),
                areaFraction,
                score:
                    rectangle *
                    rectangle *
                    symmetry *
                    upright *
                    quality *
                    contrast *
                    areaPrior(areaFraction, minAreaFraction),
            });
            return true;
        };

        for (const map of maps) {
            const contours = track(new cv.MatVector());
            const hierarchy = track(new cv.Mat());
            cv.findContours(map, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

            for (let index = 0; index < contours.size(); index += 1) {
                const contour = track(contours.get(index));
                const filled = cv.contourArea(contour);
                if (filled < frameArea * minAreaFraction) {
                    rejects.klein += 1;
                    continue;
                }

                const corners = quadFromContour(cv, contour);
                if (!corners) {
                    rejects.keinQuad += 1;
                    continue;
                }
                const quad = orderCorners(corners);
                if (!quad) {
                    rejects.ordnung += 1;
                    continue;
                }

                const rectangularity = Math.min(1, filled / quadArea(quad));
                if (rectangularity < MIN_RECTANGULARITY) {
                    rejects.füllung += 1;
                    continue;
                }
                consider(quad, rectangularity, true);
            }
        }

        for (const map of cannyMaps) {
            for (const { quad, support } of houghQuads(cv, map, workWidth, workHeight)) {
                consider(quad, support, false);
            }
        }

        onRejects?.(rejects);
        candidates.sort((a, b) => b.score - a.score);
        onCandidates?.(candidates, "alle");
        const merged = keepEnclosing(candidates);
        onCandidates?.(merged, "nach Überlappung");
        return merged.slice(0, maxCards);
    });
}

/**
 * Finds the card's own edge inside an already-rectified sleeve crop and re-rectifies to it.
 *
 * Detection locks onto the outermost strong rectangle, which for a sleeved card is the sleeve.
 * The card then sits inset by a few percent, and the embedding is measurably sensitive to that.
 * Searching the crop again is cheap, because it is only 488×680, and it finds the real edge
 * instead of guessing a trim.
 *
 * @param cropped a rectified crop, typically of a sleeve
 * @returns the re-rectified card, or null when no plausible inner edge is found
 */
export async function refineToCardEdge(cropped: RgbaImage): Promise<RgbaImage | null> {
    const inner = await detectCardsIn(cropped, { minAreaFraction: 0.45, maxCards: 3, workingSize: 640 });
    const candidate = inner.find((card) => {
        const fraction = card.areaFraction;
        return fraction > 0.55 && fraction < 0.985;
    });
    if (!candidate) return null;
    return rectifyCardIn(cropped, candidate.quad, 0);
}

/**
 * Warps one detected card onto the canonical 488×680 reference frame.
 *
 * A camera frame is usually several times larger than the target, and `warpPerspective` only
 * point-samples, so the source is first reduced by an integer factor with area averaging.
 * Skipping that step is visible as aliasing in exactly the fine structures the printing stage
 * depends on: the set symbol and the collector line.
 *
 * `rotation` re-assigns which corner is treated as the card's top left, in quarter turns. The
 * detector cannot resolve that on its own: it makes every quad portrait by construction, so a
 * card photographed sideways and an inner frame mistaken for a card both come out turned. Trying
 * the turns and letting the index pick is more reliable than any geometric rule, because the
 * index knows what a card looks like and the geometry does not.
 *
 * @param pixels the same frame the quad was detected in
 * @param quad
 * @param rotation quarter turns clockwise, 0 to 3
 * @returns the rectified card, 488×680 RGBA
 */
export async function rectifyCardIn(pixels: RgbaImage, quad: CardQuad, rotation = 0): Promise<RgbaImage> {
    const cv = await loadOpenCv();

    const quadWidth = (distance(quad.topLeft, quad.topRight) + distance(quad.bottomLeft, quad.bottomRight)) / 2;
    const reduction = Math.max(1, Math.floor(quadWidth / RECTIFIED_WIDTH));
    const scaled = scaleQuad(quad, 1 / reduction);
    const cycle = [scaled.topLeft, scaled.topRight, scaled.bottomRight, scaled.bottomLeft];
    const turn = ((rotation % 4) + 4) % 4;
    const corners = [0, 1, 2, 3].map((offset) => cycle[(offset + turn) % 4]);

    return withMats((track) => {
        const full = track(cv.matFromImageData(pixels));
        let source = full;
        if (reduction > 1) {
            const reduced = track(new cv.Mat());
            const size = new cv.Size(
                Math.max(2, Math.round(pixels.width / reduction)),
                Math.max(2, Math.round(pixels.height / reduction)),
            );
            cv.resize(full, reduced, size, 0, 0, cv.INTER_AREA);
            source = reduced;
        }

        const from = track(
            cv.matFromArray(
                4,
                1,
                cv.CV_32FC2,
                corners.flatMap((point) => [point.x, point.y]),
            ),
        );
        const to = track(
            cv.matFromArray(4, 1, cv.CV_32FC2, [
                0,
                0,
                RECTIFIED_WIDTH,
                0,
                RECTIFIED_WIDTH,
                RECTIFIED_HEIGHT,
                0,
                RECTIFIED_HEIGHT,
            ]),
        );
        const transform = track(cv.getPerspectiveTransform(from, to));
        const warped = track(new cv.Mat());
        cv.warpPerspective(
            source,
            warped,
            transform,
            new cv.Size(RECTIFIED_WIDTH, RECTIFIED_HEIGHT),
            cv.INTER_LINEAR,
            cv.BORDER_REPLICATE,
            new cv.Scalar(),
        );

        return {
            data: new Uint8ClampedArray(warped.data),
            width: RECTIFIED_WIDTH,
            height: RECTIFIED_HEIGHT,
        };
    });
}
