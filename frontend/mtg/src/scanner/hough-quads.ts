//! Builds card quads from straight line segments instead of from closed contours.
//!
//! Contour detection needs the card's outline to close. On the photos that matter it often does
//! not: a card lying on a stack has its bottom edge swallowed by the card below, and a sleeved
//! card on a busy background can lose its outer boundary almost entirely. A line does not have
//! to close, so `houghQuads` still recovers the card from three clean edges and a fragment.
//!
//! The decisive signal here is not the intersection geometry, which is cheap to satisfy by
//! accident, but {@link edgeSupport}: how much of each proposed side is actually covered by
//! detected segments. Four lines that merely happen to cross in a card-shaped way score near
//! zero on it.
import type { OpenCv } from "./opencv";
import { withMats } from "./opencv";
import type { CardQuad, Point } from "./card-detect";
import { aspectScore, orderCorners, symmetryScore } from "./card-detect";

/**
 * A Mat, as constructed by the loaded OpenCV runtime
 */
type Mat = InstanceType<OpenCv["Mat"]>;

/**
 * One detected line segment, kept with the geometry the scoring needs
 */
export type Segment = {
    a: Point;
    b: Point;
    /** Direction in radians, folded into [0, π) so opposite directions match */
    angle: number;
    length: number;
};

/**
 * A quad hypothesis together with the evidence backing it
 */
export type HoughQuad = {
    quad: CardQuad;
    /** Smallest per-side share covered by real segments, 0 to 1 */
    support: number;
};

/** Segments shorter than this share of the frame's long side are noise. */
const MIN_SEGMENT_FRACTION = 0.07;
/** Two segments count as the same side of a card below this angular difference, in radians. */
const PARALLEL_TOLERANCE = (30 * Math.PI) / 180;
/** Two sides count as adjacent above this angular difference, in radians. */
const PERPENDICULAR_MINIMUM = (45 * Math.PI) / 180;
/** Distance below which a segment is considered to lie on a side, as a share of the long side. */
const SUPPORT_BAND_FRACTION = 0.02;
/** How many lines are considered. Raising this grows the search quadratically. */
const MAX_LINES = 32;
/** Orientation buckets the line budget is spread over, across the half circle. */
const ORIENTATION_BUCKETS = 12;
/** Longest lines kept per orientation, before the overall budget applies. */
const PER_ORIENTATION = 4;
/** Cap on segments kept for support scoring; the transform can return several hundred. */
const MAX_SEGMENTS = 300;
/** Corners may fall this far outside the frame, as a share of the long side. */
const OUTSIDE_MARGIN = 0.06;

/**
 * Folds an angle into [0, π), so that a line and its reverse compare equal
 *
 * @param radians
 * @returns
 */
function foldAngle(radians: number): number {
    const folded = radians % Math.PI;
    return folded < 0 ? folded + Math.PI : folded;
}

/**
 * Smallest difference between two folded angles
 *
 * @param first
 * @param second
 * @returns a value in [0, π/2]
 */
function angleDifference(first: number, second: number): number {
    const raw = Math.abs(foldAngle(first) - foldAngle(second));
    return Math.min(raw, Math.PI - raw);
}

/**
 * Runs the probabilistic Hough transform and returns the segments worth considering.
 *
 * OpenCV.js hands the result back as a single row of `CV_32SC4`, not as one row per line, so
 * the count comes from the buffer length rather than from `rows`.
 *
 * @param cv
 * @param edges a binary edge map
 * @param longSide the frame's long side in the same coordinates
 * @returns the longest segments, longest first
 */
function findSegments(cv: OpenCv, edges: Mat, longSide: number): Segment[] {
    const minLength = Math.max(20, longSide * MIN_SEGMENT_FRACTION);
    return withMats((track) => {
        const lines = track(new cv.Mat());
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 40, minLength, longSide * 0.03);

        const segments: Segment[] = [];
        const data = lines.data32S;
        const count = Math.floor(data.length / 4);
        for (let index = 0; index < count; index += 1) {
            const a = { x: data[index * 4], y: data[index * 4 + 1] };
            const b = { x: data[index * 4 + 2], y: data[index * 4 + 3] };
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            if (length < minLength) continue;
            segments.push({ a, b, angle: foldAngle(Math.atan2(b.y - a.y, b.x - a.x)), length });
        }
        segments.sort((first, second) => second.length - first.length);
        return segments.slice(0, MAX_SEGMENTS);
    });
}

/**
 * Perpendicular distance from a point to the infinite line through a segment
 *
 * @param point
 * @param segment
 * @returns
 */
function distanceToLine(point: Point, segment: Segment): number {
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return Infinity;
    return Math.abs(dy * (point.x - segment.a.x) - dx * (point.y - segment.a.y)) / length;
}

/**
 * Merges segments that lie on the same infinite line, keeping the longest as representative.
 *
 * A card edge usually breaks into several collinear fragments. Treating each as its own
 * candidate side wastes the line budget and biases the search towards whichever edge happened
 * to fragment most.
 *
 * @param segments longest first
 * @param longSide
 * @returns the distinct lines
 */
function mergeCollinear(segments: Segment[], longSide: number): Segment[] {
    const band = longSide * SUPPORT_BAND_FRACTION;
    const distinct: Segment[] = [];
    for (const segment of segments) {
        const duplicate = distinct.some(
            (kept) =>
                angleDifference(kept.angle, segment.angle) < (10 * Math.PI) / 180 &&
                distanceToLine(segment.a, kept) < band &&
                distanceToLine(segment.b, kept) < band,
        );
        if (!duplicate) distinct.push(segment);
    }
    return distinct;
}

/**
 * Picks the lines to search, giving every orientation its own share of the budget.
 *
 * Taking the longest lines outright works on a plain table and fails completely on a patterned
 * one: a playmat's graphics are longer than a card's edges, so the card never enters the search
 * at all. Simply raising the budget does not fix it either, because the extra lines are mostly
 * more background and the added combinations cost accuracy elsewhere, measurably so.
 *
 * A card contributes lines in two near-perpendicular orientations, a busy background in all of
 * them. Reserving a quota per orientation therefore lets a card through without paying for the
 * background's bulk.
 *
 * @param lines distinct lines, longest first
 * @returns at most {@link MAX_LINES} lines, spread over orientations
 */
function selectDiverseLines(lines: Segment[]): Segment[] {
    const perBucket = new Map<number, Segment[]>();
    for (const line of lines) {
        const bucket = Math.min(
            ORIENTATION_BUCKETS - 1,
            Math.floor((foldAngle(line.angle) / Math.PI) * ORIENTATION_BUCKETS),
        );
        const kept = perBucket.get(bucket) ?? [];
        if (kept.length < PER_ORIENTATION) {
            kept.push(line);
            perBucket.set(bucket, kept);
        }
    }
    return [...perBucket.values()]
        .flat()
        .sort((first, second) => second.length - first.length)
        .slice(0, MAX_LINES);
}

/**
 * Intersection of the infinite lines through two segments
 *
 * @param first
 * @param second
 * @returns the point, or null if the lines are parallel
 */
function intersect(first: Segment, second: Segment): Point | null {
    const x1 = first.a.x;
    const y1 = first.a.y;
    const x2 = first.b.x;
    const y2 = first.b.y;
    const x3 = second.a.x;
    const y3 = second.a.y;
    const x4 = second.b.x;
    const y4 = second.b.y;
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denominator) < 1e-6) return null;
    const first2 = x1 * y2 - y1 * x2;
    const second2 = x3 * y4 - y3 * x4;
    return {
        x: (first2 * (x3 - x4) - (x1 - x2) * second2) / denominator,
        y: (first2 * (y3 - y4) - (y1 - y2) * second2) / denominator,
    };
}

/**
 * How much of each quad side is covered by actual detected segments, worst side first.
 *
 * Coverage is measured along the side: a segment contributes the length of its projection onto
 * the side, but only while it stays inside a narrow band around it. The minimum over the four
 * sides is returned because a card is only as well evidenced as its weakest edge.
 *
 * @param quad
 * @param segments
 * @param longSide
 * @returns a value in [0, 1]
 */
export function edgeSupport(quad: CardQuad, segments: Segment[], longSide: number): number {
    const band = longSide * SUPPORT_BAND_FRACTION;
    const sides: [Point, Point][] = [
        [quad.topLeft, quad.topRight],
        [quad.topRight, quad.bottomRight],
        [quad.bottomRight, quad.bottomLeft],
        [quad.bottomLeft, quad.topLeft],
    ];

    let worst = 1;
    for (const [from, to] of sides) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) return 0;
        const ux = dx / length;
        const uy = dy / length;

        const spans: [number, number][] = [];
        for (const segment of segments) {
            const line: Segment = { a: from, b: to, angle: foldAngle(Math.atan2(dy, dx)), length };
            if (angleDifference(segment.angle, line.angle) > (12 * Math.PI) / 180) continue;
            if (distanceToLine(segment.a, line) > band || distanceToLine(segment.b, line) > band) continue;
            const startAt = ((segment.a.x - from.x) * ux + (segment.a.y - from.y) * uy) / length;
            const endAt = ((segment.b.x - from.x) * ux + (segment.b.y - from.y) * uy) / length;
            const low = Math.max(0, Math.min(startAt, endAt));
            const high = Math.min(1, Math.max(startAt, endAt));
            if (high > low) spans.push([low, high]);
        }

        spans.sort((first, second) => first[0] - second[0]);
        let covered = 0;
        let cursor = 0;
        for (const [low, high] of spans) {
            const start = Math.max(low, cursor);
            if (high > start) {
                covered += high - start;
                cursor = high;
            }
        }
        worst = Math.min(worst, covered);
        if (worst === 0) return 0;
    }
    return worst;
}

/**
 * Proposes card quads from the line structure of an edge map.
 *
 * Sides are paired by orientation: two lines within {@link PARALLEL_TOLERANCE} form an opposite
 * pair, and two opposite pairs at least {@link PERPENDICULAR_MINIMUM} apart form a quad. This
 * tolerates the convergence perspective introduces, which a strict two-orientation clustering
 * would not.
 *
 * @param cv
 * @param edges a binary edge map
 * @param width of the edge map
 * @param height of the edge map
 * @returns quad hypotheses with their edge support, best supported first
 */
export function houghQuads(cv: OpenCv, edges: Mat, width: number, height: number): HoughQuad[] {
    const longSide = Math.max(width, height);
    const segments = findSegments(cv, edges, longSide);
    if (segments.length < 4) return [];
    const lines = selectDiverseLines(mergeCollinear(segments, longSide));
    if (lines.length < 4) return [];

    const opposites: [Segment, Segment][] = [];
    for (let first = 0; first < lines.length; first += 1) {
        for (let second = first + 1; second < lines.length; second += 1) {
            if (angleDifference(lines[first].angle, lines[second].angle) <= PARALLEL_TOLERANCE) {
                opposites.push([lines[first], lines[second]]);
            }
        }
    }

    const margin = longSide * OUTSIDE_MARGIN;
    const results: HoughQuad[] = [];
    for (let first = 0; first < opposites.length; first += 1) {
        for (let second = first + 1; second < opposites.length; second += 1) {
            const [a1, a2] = opposites[first];
            const [b1, b2] = opposites[second];
            const meanA = (a1.angle + a2.angle) / 2;
            const meanB = (b1.angle + b2.angle) / 2;
            if (angleDifference(meanA, meanB) < PERPENDICULAR_MINIMUM) continue;

            const corners = [intersect(a1, b1), intersect(a1, b2), intersect(a2, b2), intersect(a2, b1)];
            if (corners.some((corner) => corner === null)) continue;
            const points = corners as Point[];
            if (
                points.some(
                    (point) =>
                        !Number.isFinite(point.x) ||
                        !Number.isFinite(point.y) ||
                        point.x < -margin ||
                        point.y < -margin ||
                        point.x > width + margin ||
                        point.y > height + margin,
                )
            ) {
                continue;
            }

            const quad = orderCorners(points);
            if (!quad) continue;
            if (aspectScore(quad) <= 0) continue;
            if (symmetryScore(quad) < 0.62) continue;

            const support = edgeSupport(quad, segments, longSide);
            if (support < 0.25) continue;
            results.push({ quad, support });
        }
    }

    results.sort((first, second) => second.support - first.support);
    return results;
}
