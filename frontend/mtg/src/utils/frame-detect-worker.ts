/**
 * Web Worker for OpenCV-based card-frame detection in the live scanner.
 *
 * Two jobs, both far too heavy for the main thread while a camera renders:
 *
 * - `detect`: find the card's border in a downscaled camera frame. Canny edges into a
 *   probabilistic Hough transform; the geometry module picks the four border lines and
 *   intersects them into a quad.
 * - `rectify`: perspective-warp the full-resolution frame region behind a detected quad into an
 *   upright 63:88 card image, which the scan pipeline then treats like a pre-cropped photo.
 *
 * OpenCV (~11 MB WASM) is bundled into this worker so it loads only when the camera opens, and
 * never from a CDN.
 */

import type { CardQuad } from "./scan-client";

/** Hough vote threshold — how many edge pixels must agree on a line. */
const HOUGH_THRESHOLD = 40;
/** Border candidates must span at least this fraction of the frame's short side. */
const MIN_LINE_FRACTION = 0.25;
/** Gaps up to this many pixels are bridged, so a border broken by glare still counts. */
const MAX_LINE_GAP = 12;
/** Canny hysteresis thresholds, tuned loose — the Hough vote does the real filtering. */
const CANNY_LOW = 50;
const CANNY_HIGH = 150;

/** Find the card border in a frame */
type DetectRequest = { type: "detect"; id: number; width: number; height: number; pixels: ArrayBuffer };
/** Perspective-warp the region behind a quad into an upright card */
type RectifyRequest = {
    type: "rectify";
    id: number;
    width: number;
    height: number;
    pixels: ArrayBuffer;
    quad: CardQuad;
    outWidth: number;
    outHeight: number;
};
/** Everything the worker answers */
type Request = DetectRequest | RectifyRequest;

/** The lightweight detector is synchronous and ready as soon as the worker starts. */
const ready = Promise.resolve();

// The handshake the main thread's state machine waits for: it uses the guide-box fallback until
// "ready" arrives, and gives up on this worker for good on "init-failed".
void ready.then(
    () => self.postMessage({ type: "ready" }),
    (error: unknown) =>
        self.postMessage({
            type: "init-failed",
            message: error instanceof Error ? error.message : String(error),
        }),
);

/**
 * Finds the card quad in one frame
 *
 * @param cv the runtime
 * @param message the frame
 * @returns the quad, or `null` when none is plausible
 */
function detect(_cv: unknown, message: DetectRequest): CardQuad | null {
    const pixels = new Uint8ClampedArray(message.pixels);
    const { width, height } = message;
    const gray = (x: number, y: number) => {
        const p = (y * width + x) * 4;
        return pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114;
    };
    const fit = (points: Array<{ t: number; v: number }>) => {
        if (points.length < 8) return null;
        let st = 0, sv = 0, stt = 0, stv = 0;
        for (const point of points) { st += point.t; sv += point.v; stt += point.t * point.t; stv += point.t * point.v; }
        const denominator = points.length * stt - st * st;
        if (Math.abs(denominator) < 1e-6) return null;
        return { slope: (points.length * stv - st * sv) / denominator, intercept: (sv - ((points.length * stv - st * sv) / denominator) * st) / points.length };
    };
    const leftEdge: Array<{ t: number; v: number }> = [], rightEdge: Array<{ t: number; v: number }> = [];
    for (let y = 2; y < height - 2; y += 2) {
        let leftX = 2, rightX = width - 3, leftScore = 0, rightScore = 0;
        for (let x = 2; x < width - 2; x += 1) {
            const score = Math.abs(gray(x + 1, y) - gray(x - 1, y));
            if (x < width * 0.5 && score > leftScore) { leftScore = score; leftX = x; }
            if (x >= width * 0.5 && score > rightScore) { rightScore = score; rightX = x; }
        }
        if (leftScore > 22) leftEdge.push({ t: y, v: leftX });
        if (rightScore > 22) rightEdge.push({ t: y, v: rightX });
    }
    const topEdge: Array<{ t: number; v: number }> = [], bottomEdge: Array<{ t: number; v: number }> = [];
    for (let x = 2; x < width - 2; x += 2) {
        let topY = 2, bottomY = height - 3, topScore = 0, bottomScore = 0;
        for (let y = 2; y < height - 2; y += 1) {
            const score = Math.abs(gray(x, y + 1) - gray(x, y - 1));
            if (y < height * 0.5 && score > topScore) { topScore = score; topY = y; }
            if (y >= height * 0.5 && score > bottomScore) { bottomScore = score; bottomY = y; }
        }
        if (topScore > 22) topEdge.push({ t: x, v: topY });
        if (bottomScore > 22) bottomEdge.push({ t: x, v: bottomY });
    }
    const left = fit(leftEdge), right = fit(rightEdge), top = fit(topEdge), bottom = fit(bottomEdge);
    if (!left || !right || !top || !bottom) return null;
    const intersect = (vertical: { slope: number; intercept: number }, horizontal: { slope: number; intercept: number }) => {
        const x = (horizontal.intercept - vertical.intercept * horizontal.slope) / (1 - vertical.slope * horizontal.slope);
        return { x, y: horizontal.slope * x + horizontal.intercept };
    };
    const quad = { topLeft: intersect(left, top), topRight: intersect(right, top), bottomRight: intersect(right, bottom), bottomLeft: intersect(left, bottom) };
    const points = Object.values(quad);
    if (points.some((point) => point.x < -width * 0.1 || point.x > width * 1.1 || point.y < -height * 0.1 || point.y > height * 1.1)) return null;
    return quad;
}

/**
 * Warps the region behind a quad into an upright card image
 *
 * @param cv the runtime
 * @param message the frame, the quad and the output size
 * @returns the RGBA pixels of the rectified card
 */
function rectify(_cv: unknown, message: RectifyRequest): ArrayBuffer {
    const source = new Uint8ClampedArray(message.pixels);
    const { width, height, quad, outWidth, outHeight } = message;
    const output = new Uint8ClampedArray(outWidth * outHeight * 4);
    for (let y = 0; y < outHeight; y += 1) for (let x = 0; x < outWidth; x += 1) {
        const u = x / Math.max(1, outWidth - 1), v = y / Math.max(1, outHeight - 1);
        const topX = quad.topLeft.x + u * (quad.topRight.x - quad.topLeft.x);
        const topY = quad.topLeft.y + u * (quad.topRight.y - quad.topLeft.y);
        const bottomX = quad.bottomLeft.x + u * (quad.bottomRight.x - quad.bottomLeft.x);
        const bottomY = quad.bottomLeft.y + u * (quad.bottomRight.y - quad.bottomLeft.y);
        const sx = Math.max(0, Math.min(width - 1, Math.round(topX + v * (bottomX - topX))));
        const sy = Math.max(0, Math.min(height - 1, Math.round(topY + v * (bottomY - topY))));
        const from = (sy * width + sx) * 4;
        const to = (y * outWidth + x) * 4;
        output[to] = source[from]; output[to + 1] = source[from + 1]; output[to + 2] = source[from + 2]; output[to + 3] = 255;
    }
    return output.buffer;
}

self.onmessage = (event: MessageEvent<Request>) => {
    const message = event.data;
    void ready
        .then((cv) => {
            if (message.type === "detect") {
                const quad = detect(cv, message);
                self.postMessage({ type: "detected", id: message.id, quad });
            } else {
                const pixels = rectify(cv, message);
                self.postMessage({ type: "rectified", id: message.id, pixels }, { transfer: [pixels] });
            }
        })
        .catch((error: unknown) => {
            self.postMessage({
                type: "failed",
                id: message.id,
                message: error instanceof Error ? error.message : String(error),
            });
        });
};
