import { describe, expect, it } from "vitest";
import {
    lineIntersection,
    orderQuad,
    plausibleCardQuad,
    quadAspect,
    quadDrift,
    quadFromSegments,
    scaleQuad,
} from "./card-frame-geometry";
import type { Segment } from "./card-frame-geometry";

/** A 480×640 frame with a card roughly centred in it. */
const FRAME_W = 480;
const FRAME_H = 640;

/** The four borders of an upright card from (100,80) to (380,470), as Hough would report them. */
const cardBorders: Segment[] = [
    { x1: 105, y1: 80, x2: 370, y2: 81 }, // top
    { x1: 102, y1: 470, x2: 375, y2: 469 }, // bottom
    { x1: 100, y1: 90, x2: 101, y2: 460 }, // left
    { x1: 380, y1: 85, x2: 379, y2: 465 }, // right
];

describe("card frame geometry", () => {
    it("intersects two lines and refuses parallels", () => {
        const horizontal: Segment = { x1: 0, y1: 10, x2: 100, y2: 10 };
        const vertical: Segment = { x1: 40, y1: 0, x2: 40, y2: 100 };
        expect(lineIntersection(horizontal, vertical)).toEqual({ x: 40, y: 10 });
        expect(lineIntersection(horizontal, { x1: 0, y1: 20, x2: 100, y2: 20 })).toBeNull();
    });

    it("orders four corners top-left first and clockwise", () => {
        const quad = orderQuad([
            { x: 380, y: 470 },
            { x: 100, y: 80 },
            { x: 100, y: 470 },
            { x: 380, y: 80 },
        ]);
        expect(quad.topLeft).toEqual({ x: 100, y: 80 });
        expect(quad.topRight).toEqual({ x: 380, y: 80 });
        expect(quad.bottomRight).toEqual({ x: 380, y: 470 });
        expect(quad.bottomLeft).toEqual({ x: 100, y: 470 });
    });

    it("builds the card quad from the four border segments", () => {
        const quad = quadFromSegments(cardBorders, FRAME_W, FRAME_H);
        expect(quad).not.toBeNull();
        expect(quad?.topLeft.x).toBeCloseTo(100, 0);
        expect(quad?.topLeft.y).toBeCloseTo(80, 0);
        expect(quad?.bottomRight.x).toBeCloseTo(379, 0);
        expect(quad?.bottomRight.y).toBeCloseTo(469, 0);
        expect(quadAspect(quad!)).toBeGreaterThan(0.6);
        expect(quadAspect(quad!)).toBeLessThan(0.8);
    });

    it("prefers the long borders over short interior clutter", () => {
        const clutter: Segment[] = [
            // art box edges and text lines inside the card — shorter than the borders
            { x1: 130, y1: 150, x2: 330, y2: 150 },
            { x1: 130, y1: 330, x2: 340, y2: 331 },
            { x1: 140, y1: 200, x2: 141, y2: 300 },
            { x1: 350, y1: 210, x2: 349, y2: 290 },
        ];
        const quad = quadFromSegments([...clutter, ...cardBorders], FRAME_W, FRAME_H);
        expect(quad).not.toBeNull();
        // The synthetic borders are a pixel off axis, so the corners land within a few pixels.
        expect(Math.abs(quad!.topLeft.y - 80)).toBeLessThan(3);
        expect(Math.abs(quad!.bottomLeft.x - 100)).toBeLessThan(3);
    });

    it("beats a longer floor-board seam with the card's own border", () => {
        // A full-height plank seam left of the card — longer than any card border. Picking it
        // would widen the quad past the card aspect; the combination scoring must prefer the
        // card's own left border.
        const seam: Segment = { x1: 40, y1: 0, x2: 41, y2: 640 };
        const quad = quadFromSegments([seam, ...cardBorders], FRAME_W, FRAME_H);
        expect(quad).not.toBeNull();
        expect(Math.abs(quad!.topLeft.x - 100)).toBeLessThan(5);
    });

    it("rejects frames without a plausible card", () => {
        // Only horizontal lines — no verticals, no quad.
        expect(
            quadFromSegments(
                [
                    { x1: 10, y1: 100, x2: 400, y2: 100 },
                    { x1: 10, y1: 500, x2: 400, y2: 500 },
                ],
                FRAME_W,
                FRAME_H,
            ),
        ).toBeNull();

        // A quad far off the card aspect (a wide landscape box) is refused.
        const landscape: Segment[] = [
            { x1: 20, y1: 200, x2: 460, y2: 200 },
            { x1: 20, y1: 320, x2: 460, y2: 320 },
            { x1: 20, y1: 210, x2: 21, y2: 310 },
            { x1: 460, y1: 210, x2: 459, y2: 310 },
        ];
        expect(quadFromSegments(landscape, FRAME_W, FRAME_H)).toBeNull();
    });

    it("judges plausibility by convexity, area, aspect and bounds", () => {
        const card = orderQuad([
            { x: 100, y: 80 },
            { x: 380, y: 80 },
            { x: 380, y: 470 },
            { x: 100, y: 470 },
        ]);
        expect(plausibleCardQuad(card, FRAME_W, FRAME_H)).toBe(true);
        // Too small to be the card being scanned.
        expect(plausibleCardQuad(scaleQuad(card, 0.2), FRAME_W, FRAME_H)).toBe(false);
        // A corner far outside the frame.
        expect(plausibleCardQuad({ ...card, topLeft: { x: -200, y: 80 } }, FRAME_W, FRAME_H)).toBe(false);
    });

    it("measures drift as the largest corner movement", () => {
        const card = orderQuad([
            { x: 100, y: 80 },
            { x: 380, y: 80 },
            { x: 380, y: 470 },
            { x: 100, y: 470 },
        ]);
        const moved = { ...card, bottomRight: { x: 390, y: 470 } };
        expect(quadDrift(card, card)).toBe(0);
        expect(quadDrift(card, moved)).toBe(10);
    });
});
