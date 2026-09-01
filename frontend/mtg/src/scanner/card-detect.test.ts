import { describe, expect, it } from "vitest";
import { recoverAspectRatio } from "./card-detect";
import type { CardQuad } from "./card-detect";

const WIDTH = 1000;
const HEIGHT = 1000;
const CARD_ASPECT = 63 / 88;

/**
 * Builds a quad from four corners, clockwise from the top left
 *
 * @param corners x and y of each corner
 * @returns the quad
 */
function quad(...corners: [number, number][]): CardQuad {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners.map(([x, y]) => ({ x, y }));
    return { topLeft, topRight, bottomRight, bottomLeft };
}

/**
 * Photographs a card of the real proportions through a pinhole camera.
 *
 * Generated rather than written down, because the point of the check is what a camera can actually
 * produce, and a hand-picked quad only ever proves what its author already believed.
 *
 * @param tiltX rotation towards the camera, in radians
 * @param tiltY rotation about the vertical, in radians
 * @param focalFraction focal length as a fraction of the frame diagonal
 * @returns the projected quad
 */
function photograph(tiltX: number, tiltY: number, focalFraction = 1 / 1.4): CardQuad {
    const focal = Math.hypot(WIDTH, HEIGHT) * focalFraction;
    const corners: [number, number][] = [
        [-31.5, -44],
        [31.5, -44],
        [31.5, 44],
        [-31.5, 44],
    ];
    return quad(
        ...(corners.map(([x, y]) => {
            const [ry, rz] = [y * Math.cos(tiltX), y * Math.sin(tiltX)];
            const [rx, rz2] = [x * Math.cos(tiltY) + rz * Math.sin(tiltY), -x * Math.sin(tiltY) + rz * Math.cos(tiltY)];
            const depth = rz2 + 200;
            return [WIDTH / 2 + (focal * rx) / depth, HEIGHT / 2 + (focal * ry) / depth];
        }) as [number, number][]),
    );
}

describe("recoverAspectRatio", () => {
    it("reads a card's proportions off a head-on rectangle", () => {
        const ratio = recoverAspectRatio(quad([400, 200], [630, 200], [630, 521], [400, 521]), WIDTH, HEIGHT);
        expect(ratio).toBeCloseTo(CARD_ASPECT, 2);
    });

    it("reads them off a card photographed at an angle", () => {
        const ratio = recoverAspectRatio(photograph(0.52, 0.35), WIDTH, HEIGHT);
        expect(ratio).toBeCloseTo(CARD_ASPECT, 2);
    });

    it("reads them off a card photographed through a wider lens", () => {
        const ratio = recoverAspectRatio(photograph(0.52, 0.35, 1 / 1.1), WIDTH, HEIGHT);
        expect(ratio).toBeCloseTo(CARD_ASPECT, 2);
    });

    // A right angle at one corner and a sharp one at another. It used to come back as 0.756
    // against a card's 0.716, well inside tolerance, because the recovery quietly substituted a
    // guessed focal length for the impossible one the shape demanded.
    it("rejects a shape no camera could see a rectangle in", () => {
        expect(recoverAspectRatio(quad([500, 150], [700, 320], [640, 620], [400, 620]), WIDTH, HEIGHT)).toBeNull();
    });

    it("rejects a badly skewed blob", () => {
        expect(recoverAspectRatio(quad([300, 300], [800, 250], [560, 700], [420, 480]), WIDTH, HEIGHT)).toBeNull();
    });
});
