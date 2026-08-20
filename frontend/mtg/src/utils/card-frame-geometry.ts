/**
 * Pure geometry for Hough-based card-frame detection.
 *
 * The OpenCV worker turns a camera frame into Hough line segments; everything after that —
 * choosing the four border lines, intersecting them into a quad, judging whether that quad can be
 * a Magic card — is plain math and lives here, where it can be unit-tested without a WASM runtime.
 */

import type { CardQuad } from "./scan-client";

/** One Hough segment, in pixel coordinates of the analysed frame. */
export type Segment = { x1: number; y1: number; x2: number; y2: number };

/** A point in the analysed frame. */
export type Point = { x: number; y: number };

/**
 * How much a card is allowed to deviate from the 63:88 aspect before the quad is rejected —
 * generous, because perspective foreshortening compresses one axis.
 */
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 1.05;
/** The quad must fill at least this fraction of the frame to be the card being scanned … */
const MIN_AREA_FRACTION = 0.08;
/** … and no more than this, or we are looking at the frame border itself. */
const MAX_AREA_FRACTION = 0.97;
/** Segments within this angle of the axes count as horizontal/vertical card borders. */
const MAX_AXIS_TILT = Math.PI / 5;
/** How far outside the frame a corner may fall — a border can graze the frame edge. */
const CORNER_MARGIN_FRACTION = 0.04;

/**
 * The length of a segment
 *
 * @param segment
 * @returns
 */
export function segmentLength(segment: Segment): number {
    return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
}

/**
 * The angle of a segment folded into [0, π)
 *
 * @param segment
 * @returns
 */
export function segmentAngle(segment: Segment): number {
    const angle = Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1);
    return ((angle % Math.PI) + Math.PI) % Math.PI;
}

/**
 * Intersection of the two infinite lines through the segments
 *
 * @param a
 * @param b
 * @returns the intersection point, or `null` for (near-)parallel lines
 */
export function lineIntersection(a: Segment, b: Segment): Point | null {
    const adx = a.x2 - a.x1;
    const ady = a.y2 - a.y1;
    const bdx = b.x2 - b.x1;
    const bdy = b.y2 - b.y1;
    const denominator = adx * bdy - ady * bdx;
    if (Math.abs(denominator) < 1e-6) return null;
    const t = ((b.x1 - a.x1) * bdy - (b.y1 - a.y1) * bdx) / denominator;
    return { x: a.x1 + t * adx, y: a.y1 + t * ady };
}

/**
 * Orders four corners into a quad, top-left first and clockwise from there
 *
 * @param points exactly four corners in any order
 * @returns the ordered quad
 */
export function orderQuad(points: Point[]): CardQuad {
    const bySum = [...points].sort((left, right) => left.x + left.y - (right.x + right.y));
    const byDiff = [...points].sort((left, right) => left.x - left.y - (right.x - right.y));
    return {
        topLeft: bySum[0],
        bottomRight: bySum[bySum.length - 1],
        topRight: byDiff[byDiff.length - 1],
        bottomLeft: byDiff[0],
    };
}

/**
 * The area of a quad via the shoelace formula
 *
 * @param quad
 * @returns
 */
export function quadArea(quad: CardQuad): number {
    const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
    let doubled = 0;
    for (let index = 0; index < corners.length; index += 1) {
        const current = corners[index];
        const next = corners[(index + 1) % corners.length];
        doubled += current.x * next.y - next.x * current.y;
    }
    return Math.abs(doubled) / 2;
}

/**
 * Width/height ratio of a quad, from the averaged opposite edges
 *
 * @param quad
 * @returns
 */
export function quadAspect(quad: CardQuad): number {
    const top = Math.hypot(quad.topRight.x - quad.topLeft.x, quad.topRight.y - quad.topLeft.y);
    const bottom = Math.hypot(quad.bottomRight.x - quad.bottomLeft.x, quad.bottomRight.y - quad.bottomLeft.y);
    const left = Math.hypot(quad.bottomLeft.x - quad.topLeft.x, quad.bottomLeft.y - quad.topLeft.y);
    const right = Math.hypot(quad.bottomRight.x - quad.topRight.x, quad.bottomRight.y - quad.topRight.y);
    const height = (left + right) / 2;
    if (height === 0) return 0;
    return (top + bottom) / 2 / height;
}

/**
 * Whether the quad's corners wind without crossing over
 *
 * @param quad
 * @returns
 */
export function isConvex(quad: CardQuad): boolean {
    const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
    let sign = 0;
    for (let index = 0; index < corners.length; index += 1) {
        const a = corners[index];
        const b = corners[(index + 1) % corners.length];
        const c = corners[(index + 2) % corners.length];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (cross === 0) continue;
        const current = Math.sign(cross);
        if (sign === 0) sign = current;
        else if (current !== sign) return false;
    }
    return sign !== 0;
}

/**
 * Whether a quad can plausibly be the card lying in the frame
 *
 * @param quad the candidate
 * @param width frame width
 * @param height frame height
 * @returns
 */
export function plausibleCardQuad(quad: CardQuad, width: number, height: number): boolean {
    if (!isConvex(quad)) return false;
    const area = quadArea(quad);
    const frame = width * height;
    if (area < frame * MIN_AREA_FRACTION || area > frame * MAX_AREA_FRACTION) return false;
    const aspect = quadAspect(quad);
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false;
    const marginX = width * CORNER_MARGIN_FRACTION;
    const marginY = height * CORNER_MARGIN_FRACTION;
    for (const corner of [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]) {
        if (corner.x < -marginX || corner.x > width + marginX) return false;
        if (corner.y < -marginY || corner.y > height + marginY) return false;
    }
    return true;
}

/** How many border candidates per side enter the combination search. */
const CANDIDATES_PER_SIDE = 4;
/** The card's true aspect, which the scoring pulls the choice towards. */
const CARD_ASPECT = 63 / 88;

/**
 * The longest few segments of an orientation on one side of the frame centre.
 *
 * Length ranks the candidates — the card border is among the longest straight edges on its side —
 * but the single longest one is not trusted blindly: a table edge or a floor-board seam can be
 * longer than the card, which is what the combination scoring below sorts out.
 *
 * @param segments the candidates, already filtered to one orientation
 * @param pick maps a segment to its position along the axis of interest
 * @param side `-1` for the low side of the centre, `1` for the high side
 * @param centre the frame centre along that axis
 * @returns up to {@link CANDIDATES_PER_SIDE} segments, longest first
 */
function candidatesOnSide(
    segments: Segment[],
    pick: (segment: Segment) => number,
    side: -1 | 1,
    centre: number,
): Segment[] {
    return segments
        .filter((segment) => Math.sign(pick(segment) - centre) === side)
        .sort((left, right) => segmentLength(right) - segmentLength(left))
        .slice(0, CANDIDATES_PER_SIDE);
}

/**
 * Builds the card quad from Hough segments.
 *
 * The strongest near-horizontal segments above and below the frame centre and the strongest
 * near-vertical ones left and right of it are the border candidates; every combination of one per
 * side is intersected into a quad, and the plausible quad that looks most like a card wins. The
 * score prefers the card's 63:88 aspect first and size second — so a full-height floor-board seam
 * next to the card loses against the card's own border even though it is the longer line.
 *
 * @param segments every Hough segment of the frame
 * @param width frame width
 * @param height frame height
 * @returns the card quad, or `null` when no plausible one emerges
 */
export function quadFromSegments(segments: Segment[], width: number, height: number): CardQuad | null {
    const horizontals: Segment[] = [];
    const verticals: Segment[] = [];
    for (const segment of segments) {
        const angle = segmentAngle(segment);
        const fromHorizontal = Math.min(angle, Math.PI - angle);
        const fromVertical = Math.abs(angle - Math.PI / 2);
        if (fromHorizontal <= MAX_AXIS_TILT) horizontals.push(segment);
        else if (fromVertical <= MAX_AXIS_TILT) verticals.push(segment);
    }

    const midY = (segment: Segment) => (segment.y1 + segment.y2) / 2;
    const midX = (segment: Segment) => (segment.x1 + segment.x2) / 2;
    const tops = candidatesOnSide(horizontals, midY, -1, height / 2);
    const bottoms = candidatesOnSide(horizontals, midY, 1, height / 2);
    const lefts = candidatesOnSide(verticals, midX, -1, width / 2);
    const rights = candidatesOnSide(verticals, midX, 1, width / 2);

    let best: CardQuad | null = null;
    let bestScore = 0;
    for (const top of tops) {
        for (const bottom of bottoms) {
            for (const left of lefts) {
                for (const right of rights) {
                    const corners = [
                        lineIntersection(top, left),
                        lineIntersection(top, right),
                        lineIntersection(bottom, right),
                        lineIntersection(bottom, left),
                    ];
                    if (corners.some((corner) => corner === null)) continue;
                    const quad = orderQuad(corners as Point[]);
                    if (!plausibleCardQuad(quad, width, height)) continue;
                    // Aspect fit dominates (squared), area breaks ties towards the larger quad —
                    // a card-shaped quad beats a bigger but wider one.
                    const aspectFit = 1 - Math.min(1, Math.abs(quadAspect(quad) - CARD_ASPECT) / CARD_ASPECT);
                    const score = aspectFit * aspectFit * quadArea(quad);
                    if (score > bestScore) {
                        best = quad;
                        bestScore = score;
                    }
                }
            }
        }
    }
    return best;
}

/**
 * The largest corner movement between two detections, for the steadiness gate
 *
 * @param previous
 * @param current
 * @returns the distance in frame pixels
 */
export function quadDrift(previous: CardQuad, current: CardQuad): number {
    return Math.max(
        Math.hypot(previous.topLeft.x - current.topLeft.x, previous.topLeft.y - current.topLeft.y),
        Math.hypot(previous.topRight.x - current.topRight.x, previous.topRight.y - current.topRight.y),
        Math.hypot(previous.bottomRight.x - current.bottomRight.x, previous.bottomRight.y - current.bottomRight.y),
        Math.hypot(previous.bottomLeft.x - current.bottomLeft.x, previous.bottomLeft.y - current.bottomLeft.y),
    );
}

/**
 * Scales a quad between coordinate spaces, e.g. from the analysed low-res frame to the full-res one
 *
 * @param quad
 * @param factorX
 * @param factorY
 * @returns the scaled quad
 */
export function scaleQuad(quad: CardQuad, factorX: number, factorY = factorX): CardQuad {
    const scale = (point: Point): Point => ({ x: point.x * factorX, y: point.y * factorY });
    return {
        topLeft: scale(quad.topLeft),
        topRight: scale(quad.topRight),
        bottomRight: scale(quad.bottomRight),
        bottomLeft: scale(quad.bottomLeft),
    };
}
