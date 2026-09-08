//! Verifies the rectangle recovery against synthetic quads with known answers.
import { recoverAspectRatio, rectangleScore } from "../src/scanner/card-detect";
import type { CardQuad } from "../src/scanner/card-detect";

const WIDTH = 1000;
const HEIGHT = 1000;

/**
 * Projects a rectangle of the given ratio through a pinhole camera tilted about the x axis
 *
 * @param ratio width over height
 * @param tiltDegrees
 * @param focal
 * @returns the projected quad
 */
function project(ratio: number, tiltDegrees: number, focal: number): CardQuad {
    const half = { x: ratio / 2, y: 0.5 };
    const tilt = (tiltDegrees * Math.PI) / 180;
    const corners = [
        [-half.x, -half.y],
        [half.x, -half.y],
        [-half.x, half.y],
        [half.x, half.y],
    ].map(([x, y]) => {
        const z = 3 + y * Math.sin(tilt);
        const yy = y * Math.cos(tilt);
        return { x: WIDTH / 2 + (focal * x) / z, y: HEIGHT / 2 + (focal * yy) / z };
    });
    return { topLeft: corners[0], topRight: corners[1], bottomLeft: corners[2], bottomRight: corners[3] };
}

for (const ratio of [0.716, 1.0, 1.4]) {
    for (const tilt of [0, 15, 35, 55]) {
        const quad = project(ratio, tilt, 900);
        const recovered = recoverAspectRatio(quad, WIDTH, HEIGHT);
        const projected =
            (Math.hypot(quad.topRight.x - quad.topLeft.x, quad.topRight.y - quad.topLeft.y) +
                Math.hypot(quad.bottomRight.x - quad.bottomLeft.x, quad.bottomRight.y - quad.bottomLeft.y)) /
            (Math.hypot(quad.bottomLeft.x - quad.topLeft.x, quad.bottomLeft.y - quad.topLeft.y) +
                Math.hypot(quad.bottomRight.x - quad.topRight.x, quad.bottomRight.y - quad.topRight.y));
        console.log(
            `soll ${ratio.toFixed(3)}  kippung ${String(tilt).padStart(2)}°  ` +
                `rekonstruiert ${recovered === null ? " null " : recovered.toFixed(4)}  ` +
                `naiv ${projected.toFixed(4)}  score ${rectangleScore(quad, WIDTH, HEIGHT).toFixed(3)}`,
        );
    }
}

const skewed: CardQuad = {
    topLeft: { x: 300, y: 300 },
    topRight: { x: 700, y: 320 },
    bottomRight: { x: 640, y: 700 },
    bottomLeft: { x: 200, y: 900 },
};
console.log(`\nschiefes Viereck: ${recoverAspectRatio(skewed, WIDTH, HEIGHT)}`);
const triangleish: CardQuad = {
    topLeft: { x: 400, y: 400 },
    topRight: { x: 600, y: 400 },
    bottomRight: { x: 500, y: 401 },
    bottomLeft: { x: 400, y: 700 },
};
console.log(`fast entartet:    ${recoverAspectRatio(triangleish, WIDTH, HEIGHT)}`);
