import type { ImageSignature, IndexedCard, MatchCandidate } from "src/types";

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const CARD_ASPECT_RATIO = 63 / 88;
const NORMALIZED_CARD_WIDTH = 252;
const NORMALIZED_CARD_HEIGHT = 352;
const EDGE_SAMPLE_SIZE = 360;
const DETAIL_WIDTH = 18;
const DETAIL_HEIGHT = 24;
const ARTWORK_WIDTH = 20;
const ARTWORK_HEIGHT = 14;
const ARTWORK_EDGE_WIDTH = 32;
const ARTWORK_EDGE_HEIGHT = 24;
const SPATIAL_COLOR_WIDTH = 12;
const SPATIAL_COLOR_HEIGHT = 9;
const TITLE_WIDTH = 40;
const TITLE_HEIGHT = 8;
const EDGE_DETAIL_WIDTH = 24;
const EDGE_DETAIL_HEIGHT = 34;

/**
 * A detected card rectangle inside a source image
 */
export type CardBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
};

/**
 * Per-axis edge strength of a grayscale image
 */
type EdgeMaps = {
    vertical: Float32Array;
    horizontal: Float32Array;
    width: number;
};

/**
 * A 2d context from either canvas flavour
 */
type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/**
 * A canvas usable on the main thread and inside a worker
 */
type ScratchCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * The scan pipeline runs both on the main thread (regression harness, HTMLImageElement
 * sources) and inside a Web Worker (production scans, ImageBitmap sources). OffscreenCanvas
 * exists in both contexts and rasterizes identically; fall back to a DOM canvas only where
 * OffscreenCanvas is unavailable.
 *
 * @param width
 * @param height
 * @returns
 */
function createCanvas(width: number, height: number): ScratchCanvas {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/**
 * The 2d context of a scratch canvas
 *
 * @param canvas
 * @param willReadFrequently
 * @returns
 */
function context2d(canvas: ScratchCanvas, willReadFrequently = false): Canvas2D | null {
    return (canvas as HTMLCanvasElement).getContext(
        "2d",
        willReadFrequently ? { willReadFrequently: true } : undefined,
    ) as Canvas2D | null;
}

/**
 * Rasterises a source into RGBA pixels at the given size
 *
 * @param source
 * @param width
 * @param height
 * @returns
 */
function canvasPixels(source: CanvasImageSource, width: number, height: number): Uint8ClampedArray {
    const canvas = createCanvas(width, height);
    const context = context2d(canvas, true);
    if (!context) throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
    context.drawImage(source, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
}

/**
 * Rasterises a region of a source into RGBA pixels at the given size
 *
 * @param source
 * @param region
 * @param region.x
 * @param region.y
 * @param region.width
 * @param region.height
 * @param width
 * @param height
 * @returns
 */
function canvasRegionPixels(
    source: CanvasImageSource,
    region: { x: number; y: number; width: number; height: number },
    width: number,
    height: number,
): Uint8ClampedArray {
    const canvas = createCanvas(width, height);
    const context = context2d(canvas, true);
    if (!context) throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
    const dimensions = sourceDimensions(source);
    context.drawImage(
        source,
        region.x * dimensions.width,
        region.y * dimensions.height,
        region.width * dimensions.width,
        region.height * dimensions.height,
        0,
        0,
        width,
        height,
    );
    return context.getImageData(0, 0, width, height).data;
}

/**
 * Perceptual luma of an RGB triple
 *
 * @param red
 * @param green
 * @param blue
 * @returns
 */
function grayscale(red: number, green: number, blue: number): number {
    return red * 0.299 + green * 0.587 + blue * 0.114;
}

/**
 * The intrinsic pixel size of an image source
 *
 * @param source
 * @returns
 */
function sourceDimensions(source: CanvasImageSource): { width: number; height: number } {
    if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
        return { width: source.naturalWidth, height: source.naturalHeight };
    }
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
        return { width: source.videoWidth, height: source.videoHeight };
    }
    return {
        width: "width" in source ? Number(source.width) : NORMALIZED_CARD_WIDTH,
        height: "height" in source ? Number(source.height) : NORMALIZED_CARD_HEIGHT,
    };
}

/**
 * Smooths a projection with a small moving average
 *
 * @param values
 * @returns
 */
function smooth(values: number[]): number[] {
    return values.map((_, index) => {
        let total = 0;
        let samples = 0;
        for (let offset = -2; offset <= 2; offset += 1) {
            if (values[index + offset] !== undefined) {
                total += values[index + offset];
                samples += 1;
            }
        }
        return total / samples;
    });
}

/**
 * The strongest local maxima of a projection, strongest first
 */
function strongestPeaks(values: number[], limit = 24): number[] {
    return values
        .map((value, index) => ({ value, index }))
        .filter(
            ({ index, value }) =>
                index > 1 && index < values.length - 2 && value >= values[index - 1] && value >= values[index + 1],
        )
        .sort((left, right) => right.value - left.value)
        .reduce<number[]>((peaks, candidate) => {
            if (peaks.length < limit && peaks.every((peak) => Math.abs(peak - candidate.index) >= 4)) {
                peaks.push(candidate.index);
            }
            return peaks;
        }, [])
        .sort((left, right) => left - right);
}

/**
 * How much of a candidate border segment actually carries an edge
 *
 * @param edges
 * @param mapWidth
 * @param fixed
 * @param start
 * @param end
 * @param vertical
 * @returns
 */
function borderSegmentStrength(
    edges: Float32Array,
    mapWidth: number,
    fixed: number,
    start: number,
    end: number,
    vertical: boolean,
): number {
    let total = 0;
    let samples = 0;
    for (let position = start; position <= end; position += 2) {
        let strongest = 0;
        for (let offset = -2; offset <= 2; offset += 1) {
            const x = vertical ? fixed + offset : position;
            const y = vertical ? position : fixed + offset;
            if (x >= 0 && x < mapWidth && y >= 0 && y * mapWidth + x < edges.length) {
                strongest = Math.max(strongest, edges[y * mapWidth + x]);
            }
        }
        total += strongest;
        samples += 1;
    }
    return samples ? total / samples : 0;
}

/**
 * Picks the best card rectangle from the edge projections
 */
export function selectCardBounds(
    verticalEdges: number[],
    horizontalEdges: number[],
    edgeMaps?: EdgeMaps,
    allowEnclosingFrame = true,
): CardBounds | null {
    const vertical = smooth(verticalEdges);
    const horizontal = smooth(horizontalEdges);
    const xPeaks = strongestPeaks(vertical);
    const yPeaks = strongestPeaks(horizontal);
    const imageArea = vertical.length * horizontal.length;
    const averageEdge =
        (vertical.reduce((sum, value) => sum + value, 0) / vertical.length +
            horizontal.reduce((sum, value) => sum + value, 0) / horizontal.length) /
        2;

    let best: CardBounds | null = null;
    let bestScore = 0;
    const plausibleCandidates: Array<{ bounds: CardBounds; score: number }> = [];
    for (let leftIndex = 0; leftIndex < xPeaks.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < xPeaks.length; rightIndex += 1) {
            const left = xPeaks[leftIndex];
            const right = xPeaks[rightIndex];
            const width = right - left;
            if (width < vertical.length * 0.2) continue;

            for (let topIndex = 0; topIndex < yPeaks.length; topIndex += 1) {
                for (let bottomIndex = topIndex + 1; bottomIndex < yPeaks.length; bottomIndex += 1) {
                    const top = yPeaks[topIndex];
                    const bottom = yPeaks[bottomIndex];
                    const height = bottom - top;
                    const aspectRatio = width / height;
                    const areaRatio = (width * height) / imageArea;
                    if (height < horizontal.length * 0.25 || areaRatio < 0.08 || areaRatio > 0.96) continue;
                    // Clear sleeves often create a taller outer rectangle. Keep enough tolerance
                    // for phone perspective, but reject shapes that cannot be the card itself.
                    if (aspectRatio < 0.62 || aspectRatio > 0.83) continue;

                    const projectedSides = [vertical[left], vertical[right], horizontal[top], horizontal[bottom]];
                    const projectedStrength = projectedSides.reduce((sum, value) => sum + value, 0) / 4;
                    const sideStrengths = edgeMaps
                        ? [
                              borderSegmentStrength(edgeMaps.vertical, edgeMaps.width, left, top, bottom, true),
                              borderSegmentStrength(edgeMaps.vertical, edgeMaps.width, right, top, bottom, true),
                              borderSegmentStrength(edgeMaps.horizontal, edgeMaps.width, top, left, right, false),
                              borderSegmentStrength(edgeMaps.horizontal, edgeMaps.width, bottom, left, right, false),
                          ]
                        : projectedSides;
                    const edgeStrength = sideStrengths.reduce((sum, value) => sum + value, 0) / 4;
                    const weakestEdge = Math.min(...sideStrengths);
                    const ratioAccuracy = 1 - Math.min(1, Math.abs(aspectRatio - CARD_ASPECT_RATIO) / 0.18);
                    const score =
                        edgeStrength *
                        (0.5 + areaRatio) *
                        (0.55 + ratioAccuracy * 0.45) *
                        (edgeMaps ? 0.85 + Math.min(1, projectedStrength / Math.max(averageEdge, 0.001)) * 0.15 : 1);
                    const candidate = {
                        x: left,
                        y: top,
                        width,
                        height,
                        confidence: weakestEdge / Math.max(averageEdge, 0.001),
                    };
                    if (candidate.confidence >= 1.3) plausibleCandidates.push({ bounds: candidate, score });
                    if (score > bestScore) {
                        bestScore = score;
                        best = candidate;
                    }
                }
            }
        }
    }

    if (!best || best.confidence < 1.3) return null;

    // MTG frames contain an inner artwork/text rectangle with almost the same aspect ratio.
    // If that stronger inner frame won, prefer a credible enclosing rectangle as the card edge.
    const innerFrame = best;
    if (!allowEnclosingFrame) return innerFrame;
    const bestArea = innerFrame.width * innerFrame.height;
    /**
     * How lopsided the margin around a candidate rectangle is
     *
     * @param bounds
     * @returns
     */
    function enclosureImbalance(bounds: CardBounds): number {
        const leftMargin = innerFrame.x - bounds.x;
        const rightMargin = bounds.x + bounds.width - (innerFrame.x + innerFrame.width);
        const topMargin = innerFrame.y - bounds.y;
        const bottomMargin = bounds.y + bounds.height - (innerFrame.y + innerFrame.height);
        return Math.abs(leftMargin - rightMargin) / bounds.width + Math.abs(topMargin - bottomMargin) / bounds.height;
    }
    const enclosing = plausibleCandidates
        .filter(({ bounds, score }) => {
            const area = bounds.width * bounds.height;
            return (
                bounds.x <= innerFrame.x &&
                bounds.y <= innerFrame.y &&
                bounds.x + bounds.width >= innerFrame.x + innerFrame.width &&
                bounds.y + bounds.height >= innerFrame.y + innerFrame.height &&
                area >= bestArea * 1.15 &&
                area <= bestArea * 1.95 &&
                bounds.confidence >= 2 &&
                score >= bestScore * 0.3
            );
        })
        .sort((left, right) => {
            const balanceDifference = enclosureImbalance(left.bounds) - enclosureImbalance(right.bounds);
            if (Math.abs(balanceDifference) > 0.025) return balanceDifference;
            return right.score - left.score;
        });

    return enclosing[0]?.bounds ?? innerFrame;
}

/**
 * Detects the card rectangle in a photo
 *
 * @param source
 * @param allowEnclosingFrame
 * @returns the detected rectangle, or null if none was found
 */
export function detectCardBounds(source: CanvasImageSource, allowEnclosingFrame = true): CardBounds | null {
    const dimensions = sourceDimensions(source);
    const scale = Math.min(1, EDGE_SAMPLE_SIZE / Math.max(dimensions.width, dimensions.height));
    const width = Math.max(1, Math.round(dimensions.width * scale));
    const height = Math.max(1, Math.round(dimensions.height * scale));
    const canvas = createCanvas(width, height);
    const context = context2d(canvas, true);
    if (!context) return null;
    context.drawImage(source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const gray = new Float32Array(width * height);
    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
        gray[pixel] = grayscale(pixels[index], pixels[index + 1], pixels[index + 2]);
    }

    const verticalEdges = new Array<number>(width).fill(0);
    const horizontalEdges = new Array<number>(height).fill(0);
    const verticalMap = new Float32Array(width * height);
    const horizontalMap = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const offset = y * width + x;
            const verticalGradient = Math.abs(gray[offset + 1] - gray[offset - 1]);
            const horizontalGradient = Math.abs(gray[offset + width] - gray[offset - width]);
            verticalMap[offset] = verticalGradient;
            horizontalMap[offset] = horizontalGradient;
            verticalEdges[x] += verticalGradient;
            horizontalEdges[y] += horizontalGradient;
        }
    }
    for (let x = 0; x < width; x += 1) verticalEdges[x] /= height;
    for (let y = 0; y < height; y += 1) horizontalEdges[y] /= width;

    const bounds = selectCardBounds(
        verticalEdges,
        horizontalEdges,
        {
            vertical: verticalMap,
            horizontal: horizontalMap,
            width,
        },
        allowEnclosingFrame,
    );
    if (!bounds) return null;
    return {
        x: bounds.x / scale,
        y: bounds.y / scale,
        width: bounds.width / scale,
        height: bounds.height / scale,
        confidence: bounds.confidence,
    };
}

/**
 * The centred card-aspect rectangle, used when edge detection finds nothing
 *
 * @param width
 * @param height
 * @returns
 */
function centeredCardBounds(width: number, height: number): CardBounds {
    let cropWidth = width;
    let cropHeight = height;
    if (width / height > CARD_ASPECT_RATIO) cropWidth = height * CARD_ASPECT_RATIO;
    else cropHeight = width / CARD_ASPECT_RATIO;
    return {
        x: (width - cropWidth) / 2,
        y: (height - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
        confidence: 0,
    };
}

/**
 * Grows a rectangle slightly, clamped to the image
 *
 * @param bounds
 * @param width
 * @param height
 * @returns
 */
function expandedCardBounds(bounds: CardBounds, width: number, height: number): CardBounds {
    let expandedWidth = bounds.width;
    let expandedHeight = bounds.height;
    if (bounds.width / bounds.height < CARD_ASPECT_RATIO) expandedWidth = bounds.height * CARD_ASPECT_RATIO;
    else expandedHeight = bounds.width / CARD_ASPECT_RATIO;
    expandedWidth = Math.min(width, expandedWidth);
    expandedHeight = Math.min(height, expandedHeight);
    return {
        x: Math.max(0, Math.min(width - expandedWidth, bounds.x + (bounds.width - expandedWidth) / 2)),
        y: Math.max(0, Math.min(height - expandedHeight, bounds.y + (bounds.height - expandedHeight) / 2)),
        width: expandedWidth,
        height: expandedHeight,
        confidence: bounds.confidence,
    };
}

/**
 * Rasterises the detected card into the canonical card size
 *
 * @param source
 * @param overrideBounds
 * @returns
 */
function normalizeCardImage(source: CanvasImageSource, overrideBounds?: CardBounds): ScratchCanvas {
    const dimensions = sourceDimensions(source);
    const sourceRatio = dimensions.width / dimensions.height;
    const alreadyCropped = Math.abs(sourceRatio - CARD_ASPECT_RATIO) < 0.025;
    const bounds =
        overrideBounds ??
        (alreadyCropped
            ? { x: 0, y: 0, width: dimensions.width, height: dimensions.height, confidence: Infinity }
            : (detectCardBounds(source) ?? centeredCardBounds(dimensions.width, dimensions.height)));
    // Move a fraction inside the detected edge so the background cannot influence the hash.
    const insetX = alreadyCropped ? 0 : bounds.width * 0.006;
    const insetY = alreadyCropped ? 0 : bounds.height * 0.006;
    const canvas = createCanvas(NORMALIZED_CARD_WIDTH, NORMALIZED_CARD_HEIGHT);
    const context = context2d(canvas);
    if (!context) throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
    context.drawImage(
        source,
        bounds.x + insetX,
        bounds.y + insetY,
        bounds.width - insetX * 2,
        bounds.height - insetY * 2,
        0,
        0,
        NORMALIZED_CARD_WIDTH,
        NORMALIZED_CARD_HEIGHT,
    );
    return canvas;
}

/**
 * The four corners of the perspective-dewarp variant that the matcher actually consumes: the
 * left/right card edges located at the top and bottom of the card (top/bottom edges are treated
 * as horizontal — this variant only corrects left/right tilt). Shared by perspectiveCardImage
 * (the crop) and createScanOverlay (the debug overlay), so what is DRAWN is exactly what is USED.
 *
 * @param source
 * @param bounds
 * @returns
 */
function perspectiveCardCorners(source: CanvasImageSource, bounds: CardBounds): CardQuad | null {
    const dimensions = sourceDimensions(source);
    const scale = Math.min(1, EDGE_SAMPLE_SIZE / Math.max(dimensions.width, dimensions.height));
    const width = Math.max(1, Math.round(dimensions.width * scale));
    const height = Math.max(1, Math.round(dimensions.height * scale));
    const pixels = canvasPixels(source, width, height);
    const gray = new Float32Array(width * height);
    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
        gray[pixel] = grayscale(pixels[index], pixels[index + 1], pixels[index + 2]);
    }
    const scaled = {
        x: bounds.x * scale,
        y: bounds.y * scale,
        width: bounds.width * scale,
        height: bounds.height * scale,
    };

    /**
     * The strongest side edge within a horizontal band, used for the per-row correction
     *
     * @param topFraction
     * @param bottomFraction
     * @param leftSide
     * @returns
     */
    function sidePeak(topFraction: number, bottomFraction: number, leftSide: boolean): number {
        const startY = Math.max(1, Math.floor(scaled.y + scaled.height * topFraction));
        const endY = Math.min(height - 2, Math.ceil(scaled.y + scaled.height * bottomFraction));
        const center = leftSide ? scaled.x : scaled.x + scaled.width;
        const startX = Math.max(1, Math.floor(center - scaled.width * 0.22));
        const endX = Math.min(width - 2, Math.ceil(center + scaled.width * 0.22));
        const strengths: number[] = [];
        for (let x = startX; x <= endX; x += 1) {
            let total = 0;
            for (let y = startY; y <= endY; y += 2) {
                total += Math.abs(gray[y * width + x + 1] - gray[y * width + x - 1]);
            }
            strengths.push(total);
        }
        const smoothed = strengths.map(
            (value, index) => (value + (strengths[index - 1] ?? value) + (strengths[index + 1] ?? value)) / 3,
        );
        const maximum = Math.max(...smoothed);
        const peaks = smoothed
            .map((value, index) => ({ value, x: startX + index }))
            .filter(
                ({ value }, index) =>
                    value >= maximum * 0.52 &&
                    value >= (smoothed[index - 1] ?? -Infinity) &&
                    value >= (smoothed[index + 1] ?? -Infinity),
            );
        if (!peaks.length) return center;
        return (leftSide ? peaks[0] : peaks[peaks.length - 1]).x;
    }

    const insetY = bounds.height * 0.006;
    const top = bounds.y + insetY;
    const bottom = bounds.y + bounds.height - insetY;
    return {
        topLeft: { x: sidePeak(0.02, 0.28, true) / scale, y: top },
        topRight: { x: sidePeak(0.02, 0.28, false) / scale, y: top },
        bottomRight: { x: sidePeak(0.72, 0.98, false) / scale, y: bottom },
        bottomLeft: { x: sidePeak(0.72, 0.98, true) / scale, y: bottom },
    };
}

/**
 * Corrects the card's sideways perspective row by row
 *
 * @param source
 * @param bounds
 * @returns
 */
function perspectiveCardImage(source: CanvasImageSource, bounds: CardBounds): ScratchCanvas | null {
    const corners = perspectiveCardCorners(source, bounds);
    if (!corners) return null;
    const topLeft = corners.topLeft.x;
    const bottomLeft = corners.bottomLeft.x;
    const topRight = corners.topRight.x;
    const bottomRight = corners.bottomRight.x;
    const canvas = createCanvas(NORMALIZED_CARD_WIDTH, NORMALIZED_CARD_HEIGHT);
    const context = context2d(canvas);
    if (!context) return null;
    const insetY = bounds.height * 0.006;
    for (let y = 0; y < NORMALIZED_CARD_HEIGHT; y += 1) {
        const fraction = (y + 0.5) / NORMALIZED_CARD_HEIGHT;
        const sourceY = bounds.y + insetY + fraction * (bounds.height - insetY * 2);
        const left = topLeft + (bottomLeft - topLeft) * fraction;
        const right = topRight + (bottomRight - topRight) * fraction;
        const insetX = (right - left) * 0.006;
        context.drawImage(
            source,
            left + insetX,
            sourceY,
            Math.max(1, right - left - insetX * 2),
            Math.max(1, bounds.height / NORMALIZED_CARD_HEIGHT + 1),
            0,
            y,
            NORMALIZED_CARD_WIDTH,
            1.25,
        );
    }
    return canvas;
}

/**
 * Packs a bit vector into a hex string
 *
 * @param bits
 * @returns
 */
function bitsToHex(bits: boolean[]): string {
    let value = 0n;
    for (const bit of bits) value = (value << 1n) | (bit ? 1n : 0n);
    return value.toString(16).padStart(Math.ceil(bits.length / 4), "0");
}

/**
 * Difference hash of an image
 *
 * @param source
 * @returns
 */
function differenceHash(source: CanvasImageSource): string {
    const pixels = canvasPixels(source, HASH_WIDTH, HASH_HEIGHT);
    const bits: boolean[] = [];
    for (let y = 0; y < HASH_HEIGHT; y += 1) {
        for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
            const offset = (y * HASH_WIDTH + x) * 4;
            const nextOffset = offset + 4;
            bits.push(
                grayscale(pixels[offset], pixels[offset + 1], pixels[offset + 2]) >
                    grayscale(pixels[nextOffset], pixels[nextOffset + 1], pixels[nextOffset + 2]),
            );
        }
    }
    return bitsToHex(bits);
}

/**
 * Average hash of an image
 *
 * @param source
 * @returns
 */
function averageHash(source: CanvasImageSource): string {
    const pixels = canvasPixels(source, 8, 8);
    const values: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
        values.push(grayscale(pixels[index], pixels[index + 1], pixels[index + 2]));
    }
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return bitsToHex(values.map((value) => value >= average));
}

/**
 * Difference hash of the artwork region only
 *
 * @param source
 * @returns
 */
function artworkHash(source: CanvasImageSource): string {
    const width = 9;
    const height = 8;
    const pixels = canvasRegionPixels(source, { x: 0.06, y: 0.04, width: 0.88, height: 0.62 }, width, height);
    const bits: boolean[] = [];
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width - 1; x += 1) {
            const offset = (y * width + x) * 4;
            const next = offset + 4;
            bits.push(
                grayscale(pixels[offset], pixels[offset + 1], pixels[offset + 2]) >
                    grayscale(pixels[next], pixels[next + 1], pixels[next + 2]),
            );
        }
    }
    return bitsToHex(bits);
}

/**
 * Fine-grained luma vector of the whole card
 *
 * @param source
 * @returns
 */
function detailSignature(source: CanvasImageSource): number[] {
    const pixels = canvasPixels(source, DETAIL_WIDTH, DETAIL_HEIGHT);
    const details: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
        details.push(grayscale(pixels[index], pixels[index + 1], pixels[index + 2]) / 255);
    }
    return details;
}

/**
 * Luma vector of the artwork region
 *
 * @param source
 * @returns
 */
function artworkSignature(source: CanvasImageSource): number[] {
    // The upper card area contains the title and artwork. It separates poster-frame
    // variants that otherwise have almost identical borders and text-box layouts.
    const pixels = canvasRegionPixels(
        source,
        { x: 0.06, y: 0.04, width: 0.88, height: 0.62 },
        ARTWORK_WIDTH,
        ARTWORK_HEIGHT,
    );
    const details: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
        details.push(grayscale(pixels[index], pixels[index + 1], pixels[index + 2]) / 255);
    }
    return details;
}

/**
 * Edge vector of the artwork region
 *
 * @param source
 * @returns
 */
function artworkEdgeSignature(source: CanvasImageSource): number[] {
    const pixels = canvasRegionPixels(
        source,
        { x: 0.06, y: 0.04, width: 0.88, height: 0.62 },
        ARTWORK_EDGE_WIDTH,
        ARTWORK_EDGE_HEIGHT,
    );
    const luma = new Float32Array(ARTWORK_EDGE_WIDTH * ARTWORK_EDGE_HEIGHT);
    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
        luma[pixel] = grayscale(pixels[index], pixels[index + 1], pixels[index + 2]) / 255;
    }
    const edges = new Array<number>(luma.length).fill(0);
    for (let y = 1; y < ARTWORK_EDGE_HEIGHT - 1; y += 1) {
        for (let x = 1; x < ARTWORK_EDGE_WIDTH - 1; x += 1) {
            const offset = y * ARTWORK_EDGE_WIDTH + x;
            const horizontal = luma[offset + 1] - luma[offset - 1];
            const vertical = luma[offset + ARTWORK_EDGE_WIDTH] - luma[offset - ARTWORK_EDGE_WIDTH];
            edges[offset] = Math.sqrt(horizontal * horizontal + vertical * vertical) / Math.SQRT2;
        }
    }
    return edges;
}

/**
 * Coarse colour vector on a spatial grid
 *
 * @param source
 * @returns
 */
function spatialColorSignature(source: CanvasImageSource): number[] {
    const pixels = canvasRegionPixels(
        source,
        { x: 0.06, y: 0.04, width: 0.88, height: 0.62 },
        SPATIAL_COLOR_WIDTH,
        SPATIAL_COLOR_HEIGHT,
    );
    const colors: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
        const total = Math.max(1, pixels[index] + pixels[index + 1] + pixels[index + 2]);
        colors.push(pixels[index] / total, pixels[index + 1] / total, pixels[index + 2] / total);
    }
    return colors;
}

/**
 * Luma vector of the title strip
 *
 * @param source
 * @returns
 */
function titleSignature(source: CanvasImageSource): number[] {
    const pixels = canvasRegionPixels(
        source,
        { x: 0.07, y: 0.055, width: 0.86, height: 0.1 },
        TITLE_WIDTH,
        TITLE_HEIGHT,
    );
    const luma = new Float32Array(TITLE_WIDTH * TITLE_HEIGHT);
    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
        luma[pixel] = grayscale(pixels[index], pixels[index + 1], pixels[index + 2]) / 255;
    }
    const title = new Array<number>(luma.length).fill(0);
    for (let y = 1; y < TITLE_HEIGHT - 1; y += 1) {
        for (let x = 1; x < TITLE_WIDTH - 1; x += 1) {
            const offset = y * TITLE_WIDTH + x;
            const horizontal = luma[offset + 1] - luma[offset - 1];
            const vertical = luma[offset + TITLE_WIDTH] - luma[offset - TITLE_WIDTH];
            title[offset] = Math.sqrt(horizontal * horizontal + vertical * vertical) / Math.SQRT2;
        }
    }
    return title;
}

/**
 * Edge vector of an arbitrary region of the card
 *
 * @param source
 * @param region
 * @param region.x
 * @param region.y
 * @param region.width
 * @param region.height
 * @param width
 * @param height
 * @returns
 */
function regionEdgeSignature(
    source: CanvasImageSource,
    region: { x: number; y: number; width: number; height: number },
    width: number,
    height: number,
): number[] {
    const pixels = canvasRegionPixels(source, region, width, height);
    const luma = new Float32Array(width * height);
    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
        luma[pixel] = grayscale(pixels[index], pixels[index + 1], pixels[index + 2]) / 255;
    }
    const edges = new Array<number>(luma.length).fill(0);
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const offset = y * width + x;
            const horizontal = luma[offset + 1] - luma[offset - 1];
            const vertical = luma[offset + width] - luma[offset - width];
            edges[offset] = Math.sqrt(horizontal * horizontal + vertical * vertical) / Math.SQRT2;
        }
    }
    return edges;
}

/**
 * Chroma vector, which survives the colour cast of a phone photo
 *
 * @param source
 * @returns
 */
function chromaSignature(source: CanvasImageSource): number[] {
    const pixels = canvasPixels(source, 24, 32);
    const hueBuckets = new Array<number>(12).fill(0);
    let totalWeight = 0;
    let saturationTotal = 0;

    for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index] / 255;
        const green = pixels[index + 1] / 255;
        const blue = pixels[index + 2] / 255;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const delta = maximum - minimum;
        const saturation = maximum === 0 ? 0 : delta / maximum;
        let hue = 0;
        if (delta > 0) {
            if (maximum === red) hue = ((green - blue) / delta + 6) % 6;
            else if (maximum === green) hue = (blue - red) / delta + 2;
            else hue = (red - green) / delta + 4;
            hue /= 6;
        }
        const weight = saturation * Math.sqrt(maximum);
        hueBuckets[Math.min(11, Math.floor(hue * 12))] += weight;
        totalWeight += weight;
        saturationTotal += saturation;
    }

    return [...hueBuckets.map((value) => value / Math.max(totalWeight, 0.001)), saturationTotal / (pixels.length / 4)];
}

/**
 * Edge vector of the whole card
 *
 * @param source
 * @returns
 */
function edgeSignature(source: CanvasImageSource): number[] {
    const pixels = canvasPixels(source, EDGE_DETAIL_WIDTH, EDGE_DETAIL_HEIGHT);
    const luma = new Float32Array(EDGE_DETAIL_WIDTH * EDGE_DETAIL_HEIGHT);
    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
        luma[pixel] = grayscale(pixels[index], pixels[index + 1], pixels[index + 2]) / 255;
    }

    const edges = new Array<number>(luma.length).fill(0);
    for (let y = 1; y < EDGE_DETAIL_HEIGHT - 1; y += 1) {
        for (let x = 1; x < EDGE_DETAIL_WIDTH - 1; x += 1) {
            const offset = y * EDGE_DETAIL_WIDTH + x;
            const horizontal = luma[offset + 1] - luma[offset - 1];
            const vertical = luma[offset + EDGE_DETAIL_WIDTH] - luma[offset - EDGE_DETAIL_WIDTH];
            edges[offset] = Math.sqrt(horizontal * horizontal + vertical * vertical) / Math.SQRT2;
        }
    }
    return edges;
}

/**
 * Mean colour vector and dominant colour of a card
 *
 * @param source
 * @returns
 */
function colorSignature(source: CanvasImageSource): Pick<ImageSignature, "colorVector" | "dominantColor"> {
    const pixels = canvasPixels(source, 16, 16);
    const buckets = new Array<number>(12).fill(0);
    let redTotal = 0;
    let greenTotal = 0;
    let blueTotal = 0;

    for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        redTotal += red;
        greenTotal += green;
        blueTotal += blue;
        buckets[Math.min(3, Math.floor(red / 64))] += 1;
        buckets[4 + Math.min(3, Math.floor(green / 64))] += 1;
        buckets[8 + Math.min(3, Math.floor(blue / 64))] += 1;
    }

    const channelTotals = [redTotal, greenTotal, blueTotal];
    return {
        colorVector: buckets.map((value) => value / 256),
        dominantColor: channelTotals.indexOf(Math.max(...channelTotals)),
    };
}

/**
 * Builds the full signature of an already normalised card image
 *
 * @param normalizedCard
 * @returns
 */
function signatureFromNormalizedCard(normalizedCard: CanvasImageSource): ImageSignature {
    return {
        differenceHash: differenceHash(normalizedCard),
        averageHash: averageHash(normalizedCard),
        artworkHash: artworkHash(normalizedCard),
        detailVector: detailSignature(normalizedCard),
        artworkVector: artworkSignature(normalizedCard),
        artworkEdgeVector: artworkEdgeSignature(normalizedCard),
        spatialColorVector: spatialColorSignature(normalizedCard),
        titleVector: titleSignature(normalizedCard),
        setSymbolVector: regionEdgeSignature(normalizedCard, { x: 0.82, y: 0.42, width: 0.15, height: 0.13 }, 16, 16),
        footerVector: regionEdgeSignature(normalizedCard, { x: 0.04, y: 0.88, width: 0.92, height: 0.1 }, 40, 8),
        stampVector: regionEdgeSignature(normalizedCard, { x: 0.015, y: 0.84, width: 0.2, height: 0.145 }, 20, 20),
        chromaVector: chromaSignature(normalizedCard),
        edgeVector: edgeSignature(normalizedCard),
        ...colorSignature(normalizedCard),
    };
}

/**
 * The perceptual signature of a card photo
 *
 * @param source
 * @returns the signature
 */
export function createImageSignature(source: CanvasImageSource): ImageSignature {
    return signatureFromNormalizedCard(normalizeCardImage(source));
}

/**
 * Normalised card renderings, grouped by what they are good for (identification vs printing)
 *
 * @param source
 * @returns
 */
function createNormalizedCardVariantGroups(source: CanvasImageSource): {
    identification: ScratchCanvas[];
    printing: ScratchCanvas[];
} {
    const dimensions = sourceDimensions(source);
    const sourceRatio = dimensions.width / dimensions.height;
    if (Math.abs(sourceRatio - CARD_ASPECT_RATIO) < 0.025) {
        const normalized = normalizeCardImage(source);
        return { identification: [normalized], printing: [normalized] };
    }
    const detected = detectCardBounds(source) ?? centeredCardBounds(dimensions.width, dimensions.height);
    const expanded = expandedCardBounds(detected, dimensions.width, dimensions.height);
    const identification = [normalizeCardImage(source, detected)];
    const printing = [...identification];
    const perspective = perspectiveCardImage(source, detected);
    if (perspective) {
        identification.push(perspective);
        printing.push(perspective);
        const refinedBounds = detectCardBounds(perspective);
        if (
            refinedBounds &&
            refinedBounds.width * refinedBounds.height < NORMALIZED_CARD_WIDTH * NORMALIZED_CARD_HEIGHT * 0.96
        ) {
            printing.push(normalizeCardImage(perspective, refinedBounds));
        }
    }
    // Rotation/perspective-corrected crop from the model-fitted card quad. Additive: the matcher
    // fine-ranks every variant and keeps the max similarity, so an extra good crop can only improve
    // recall (a tilted card that no axis-aligned variant captured now has a rectified variant).
    const quad = detectCardQuadModel(source);
    if (quad) {
        const warped = warpQuadToCard(source, quad);
        if (warped) {
            identification.push(warped);
            printing.push(warped);
        }
    }
    if (
        Math.abs(expanded.x - detected.x) > 1 ||
        Math.abs(expanded.y - detected.y) > 1 ||
        Math.abs(expanded.width - detected.width) > 2 ||
        Math.abs(expanded.height - detected.height) > 2
    ) {
        const expandedCard = normalizeCardImage(source, expanded);
        identification.push(expandedCard);
        printing.push(expandedCard);
    }
    return { identification, printing };
}

/**
 * Every normalised rendering of a card photo the matcher should try
 *
 * @param source
 * @returns one canvas per rendering
 */
export function createNormalizedCardVariants(source: CanvasImageSource): ScratchCanvas[] {
    return createNormalizedCardVariantGroups(source).printing;
}

/**
 * High-resolution crop of the card's top strip (title bar), taken straight from the detected
 * card bounds BEFORE the 252px signature downscale. OCR needs this resolution: on the 252px
 * normalized card the title is only ~156px wide (~11px/char) and reads unreliably across
 * browsers; here it is ~1000px wide.
 *
 * @param source
 * @param top
 * @param bottom
 * @returns
 */
function createCardBandOcrSource(source: CanvasImageSource, top: number, bottom: number): ScratchCanvas {
    const dimensions = sourceDimensions(source);
    const sourceRatio = dimensions.width / dimensions.height;
    const alreadyCropped = Math.abs(sourceRatio - CARD_ASPECT_RATIO) < 0.025;
    const bounds = alreadyCropped
        ? { x: 0, y: 0, width: dimensions.width, height: dimensions.height, confidence: Infinity }
        : (detectCardBounds(source) ?? centeredCardBounds(dimensions.width, dimensions.height));
    const insetX = alreadyCropped ? 0 : bounds.width * 0.006;
    const insetY = alreadyCropped ? 0 : bounds.height * 0.006;
    const targetWidth = 1000;
    const targetHeight = Math.round((targetWidth / CARD_ASPECT_RATIO) * (bottom - top));
    const cardHeight = bounds.height - insetY * 2;
    const canvas = createCanvas(targetWidth, targetHeight);
    const context = context2d(canvas);
    if (!context) throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
    context.drawImage(
        source,
        bounds.x + insetX,
        bounds.y + insetY + cardHeight * top,
        bounds.width - insetX * 2,
        cardHeight * (bottom - top),
        0,
        0,
        targetWidth,
        targetHeight,
    );
    return canvas;
}

/**
 * The high-resolution crop of the card's title line that OCR reads
 *
 * @param source
 * @returns the title crop
 */
export function createTitleOcrSource(source: CanvasImageSource): ScratchCanvas {
    return createCardBandOcrSource(source, 0, OCR_TITLE_TOP_FRACTION);
}

/**
 * High-resolution crop of the card's lower name banner — where **full-art** cards put their
 *  name, since they have no title bar at the top (a full-art basic land's top 30% is pure
 *  artwork, so `createTitleOcrSource` reads sky). The banner sits at the same height as an
 *  ordinary card's type line, so this crop is only ever OCR'd as a fallback and its result is
 *  only accepted for basic-land names — on a normal card this region holds the type line
 *  ("Creature — Elf Druid"), which must never be mistaken for a card name.
 *
 * @param source
 * @returns the name-banner crop
 */
export function createFullArtNameOcrSource(source: CanvasImageSource): ScratchCanvas {
    return createCardBandOcrSource(source, OCR_FULL_ART_NAME_TOP, OCR_FULL_ART_NAME_BOTTOM);
}

/** A point in the source image's (EXIF-corrected) pixel coordinates. */
export type QuadPoint = { x: number; y: number };

/**
 * Four corners of a quadrilateral, clockwise from the top-left. A perspective photo makes the
 *  card a trapezoid rather than an axis-aligned rectangle, so the frame is a general quad.
 */
export type CardQuad = { topLeft: QuadPoint; topRight: QuadPoint; bottomRight: QuadPoint; bottomLeft: QuadPoint };

/**
 * Geometry the scanner actually consumes on a photo, surfaced for a debug overlay so that what
 *  is DRAWN is exactly what is USED:
 *   - `crop`: the axis-aligned bounds ({@link detectCardBounds}) — the primary identification/
 *     printing crop (also the base for the OCR crop and the expanded/perspective variants).
 *   - `perspective`: the left/right-dewarped trapezoid variant ({@link perspectiveCardCorners})
 *     the matcher also fine-ranks against — this is the "perspective" the pipeline really uses.
 *   - `ocr`: the axis-aligned title rectangle {@link createTitleOcrSource} feeds to Tesseract.
 *  `width`/`height` are the source's dimensions, so callers can position the shapes (SVG viewBox).
 */
export type ScanOverlay = {
    width: number;
    height: number;
    crop: CardQuad;
    perspective: CardQuad | null;
    ocr: CardQuad;
};

// The OCR title crop keeps the top 30% of the card (createTitleOcrSource) and, within that
// strip, its left 68% (TITLE_REGION in title-ocr.ts drops the mana cost). Keep in sync with both.
// Top strip of the card handed to OCR. It is deliberately generous (the title band is isolated
// *within* it by findTitleBand, and borderless cards need the extra context) — the overlay does
// NOT show this whole strip; scan-client tightens the displayed OCR box down to the actual title
// band once OCR has located it. Used by createTitleOcrSource (the real crop) and, as the initial
// pre-OCR overlay box, by createScanOverlay.
const OCR_TITLE_TOP_FRACTION = 0.3;
// The full-art name banner, as a fraction of card height. Full-art cards carry their name in a
// banner sitting at the same height as an ordinary card's type line (~0.87). The window runs to
// the very bottom edge and starts well above the banner, because it has to survive imperfect
// framing: a card held slightly short in the guide (or a card edge detected a few percent high)
// shifts the banner down within the crop, and a tight window would clip exactly the one line
// this crop exists to read.
const OCR_FULL_ART_NAME_TOP = 0.74;
const OCR_FULL_ART_NAME_BOTTOM = 1;
const OCR_TITLE_WIDTH_FRACTION = 0.68;

/**
 * A quad from an axis-aligned rectangle
 *
 * @param x
 * @param y
 * @param width
 * @param height
 * @returns
 */
function rectQuad(x: number, y: number, width: number, height: number): CardQuad {
    return {
        topLeft: { x, y },
        topRight: { x: x + width, y },
        bottomRight: { x: x + width, y: y + height },
        bottomLeft: { x, y: y + height },
    };
}

/**
 * Convex hull (Andrew's monotone chain), counter-clockwise.
 *
 * @param points
 * @returns
 */
function convexHull(points: QuadPoint[]): QuadPoint[] {
    if (points.length < 3) return points.slice();
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o: QuadPoint, a: QuadPoint, b: QuadPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower: QuadPoint[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: QuadPoint[] = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

/**
 * Minimum-area enclosing rectangle of a convex hull (rotating calipers): the rectangle is aligned
 * to one of the hull edges. Returns the four corners plus the two side lengths.
 *
 * @param hull
 * @returns
 */
function minAreaRect(hull: QuadPoint[]): { corners: QuadPoint[]; width: number; height: number } | null {
    if (hull.length < 3) return null;
    let best: { area: number; corners: QuadPoint[]; width: number; height: number } | null = null;
    for (let i = 0; i < hull.length; i += 1) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        let ex = b.x - a.x;
        let ey = b.y - a.y;
        const len = Math.hypot(ex, ey);
        if (len < 1e-6) continue;
        ex /= len;
        ey /= len;
        const perpX = -ey;
        const perpY = ex;
        let minU = Infinity,
            maxU = -Infinity,
            minV = Infinity,
            maxV = -Infinity;
        for (const p of hull) {
            const u = p.x * ex + p.y * ey;
            const v = p.x * perpX + p.y * perpY;
            if (u < minU) minU = u;
            if (u > maxU) maxU = u;
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
        }
        const width = maxU - minU;
        const height = maxV - minV;
        const area = width * height;
        if (!best || area < best.area) {
            const toXY = (u: number, v: number): QuadPoint => ({ x: u * ex + v * perpX, y: u * ey + v * perpY });
            best = {
                area,
                width,
                height,
                corners: [toXY(minU, minV), toXY(maxU, minV), toXY(maxU, maxV), toXY(minU, maxV)],
            };
        }
    }
    return best ? { corners: best.corners, width: best.width, height: best.height } : null;
}

/**
 * Contour-based card detector (the document-scanner approach). Finds the strongest high-contrast
 *  edges, links them into connected components, takes the largest component's convex hull and its
 *  minimum-area (rotated) rectangle, and accepts it only if it matches the 63:88 card shape.
 *
 *  NOTE: currently NOT wired in. Evaluated against the anchored line-refinement (detectCardQuadModel)
 *  and found worse on the common cluttered case: the dilation links a target card's edges to
 *  adjacent cards, so the largest component merges neighbours into one oversized rectangle. Kept
 *  as a basis for a future version that segments per-card before hulling.
 *
 * @param source
 * @returns the detected quad, or null if none was found
 */
export function detectCardQuadContour(source: CanvasImageSource): CardQuad | null {
    const dimensions = sourceDimensions(source);
    const scale = Math.min(1, EDGE_SAMPLE_SIZE / Math.max(dimensions.width, dimensions.height));
    const width = Math.max(8, Math.round(dimensions.width * scale));
    const height = Math.max(8, Math.round(dimensions.height * scale));
    const pixels = canvasPixels(source, width, height);
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1)
        gray[p] = grayscale(pixels[i], pixels[i + 1], pixels[i + 2]);

    const mag = new Float32Array(width * height);
    let magSum = 0;
    let magSq = 0;
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const o = y * width + x;
            const dx =
                (gray[o + 1] - gray[o - 1]) * 2 +
                (gray[o + 1 - width] - gray[o - 1 - width]) +
                (gray[o + 1 + width] - gray[o - 1 + width]);
            const dy =
                (gray[o + width] - gray[o - width]) * 2 +
                (gray[o + width - 1] - gray[o - width - 1]) +
                (gray[o + width + 1] - gray[o - width + 1]);
            const m = Math.hypot(dx, dy);
            mag[o] = m;
            magSum += m;
            magSq += m * m;
        }
    }
    const n = Math.max(1, (width - 2) * (height - 2));
    const mean = magSum / n;
    const std = Math.sqrt(Math.max(0, magSq / n - mean * mean));
    const threshold = mean + std;

    // Binary high-contrast edge map, dilated 3×3 so a card border with small gaps links up.
    const edge = new Uint8Array(width * height);
    for (let i = 0; i < edge.length; i += 1) edge[i] = mag[i] >= threshold ? 1 : 0;
    const dil = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const o = y * width + x;
            if (
                edge[o] ||
                edge[o - 1] ||
                edge[o + 1] ||
                edge[o - width] ||
                edge[o + width] ||
                edge[o - width - 1] ||
                edge[o - width + 1] ||
                edge[o + width - 1] ||
                edge[o + width + 1]
            ) {
                dil[o] = 1;
            }
        }
    }

    // Connected components (union-find, 8-connectivity); keep the largest.
    const parent = new Int32Array(width * height);
    for (let i = 0; i < parent.length; i += 1) parent[i] = i;
    const find = (a: number): number => {
        let root = a;
        while (parent[root] !== root) root = parent[root];
        while (parent[a] !== root) {
            const next = parent[a];
            parent[a] = root;
            a = next;
        }
        return root;
    };
    const union = (a: number, b: number) => {
        const ra = find(a),
            rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    };
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const o = y * width + x;
            if (!dil[o]) continue;
            if (dil[o - 1]) union(o, o - 1);
            if (dil[o - width]) union(o, o - width);
            if (dil[o - width - 1]) union(o, o - width - 1);
            if (dil[o - width + 1]) union(o, o - width + 1);
        }
    }
    const counts = new Map<number, number>();
    for (let o = 0; o < dil.length; o += 1) {
        if (!dil[o]) continue;
        const r = find(o);
        counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    let bestRoot = -1;
    let bestCount = 0;
    for (const [root, count] of counts)
        if (count > bestCount) {
            bestCount = count;
            bestRoot = root;
        }
    if (bestRoot < 0 || bestCount < width + height) return null; // too small to be a card outline

    const points: QuadPoint[] = [];
    for (let o = 0; o < dil.length; o += 1) {
        if (dil[o] && find(o) === bestRoot) points.push({ x: o % width, y: Math.floor(o / width) });
    }
    const rect = minAreaRect(convexHull(points));
    if (!rect) return null;

    // 63:88 shape check (either portrait or landscape orientation of the rect), and it must cover a
    // meaningful fraction of the frame.
    const short = Math.min(rect.width, rect.height);
    const long = Math.max(rect.width, rect.height);
    if (long < 1) return null;
    if (Math.abs(short / long - CARD_ASPECT_RATIO) > 0.12) return null;
    if ((rect.width * rect.height) / (width * height) < 0.12) return null;

    // Order corners TL, TR, BR, BL (robust for the mild rotations of a hand-held photo) and rescale.
    const toSource = rect.corners.map((c) => ({ x: c.x / scale, y: c.y / scale }));
    const topLeft = toSource.reduce((m, p) => (p.x + p.y < m.x + m.y ? p : m));
    const bottomRight = toSource.reduce((m, p) => (p.x + p.y > m.x + m.y ? p : m));
    const topRight = toSource.reduce((m, p) => (p.x - p.y > m.x - m.y ? p : m));
    const bottomLeft = toSource.reduce((m, p) => (p.x - p.y < m.x - m.y ? p : m));
    if (topLeft === bottomRight || topRight === bottomLeft) return null;
    return { topLeft, topRight, bottomRight, bottomLeft };
}

/**
 * Robust least-squares fit of coord = a·pos + b, with one outlier-rejection pass (drop points
 * beyond 1.5× the RMS residual, then refit). Returns null when there are too few samples.
 */
function fitEdgeLine(samples: Array<{ pos: number; coord: number }>): { a: number; b: number } | null {
    if (samples.length < 6) return null;
    const solve = (points: Array<{ pos: number; coord: number }>) => {
        const n = points.length;
        let sp = 0,
            sc = 0,
            spp = 0,
            spc = 0;
        for (const { pos, coord } of points) {
            sp += pos;
            sc += coord;
            spp += pos * pos;
            spc += pos * coord;
        }
        const denom = n * spp - sp * sp;
        if (Math.abs(denom) < 1e-6) return { a: 0, b: sc / n };
        const a = (n * spc - sp * sc) / denom;
        return { a, b: (sc - a * sp) / n };
    };
    let line = solve(samples);
    const residuals = samples.map(({ pos, coord }) => Math.abs(line.a * pos + line.b - coord));
    const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
    const inliers = samples.filter((_, i) => residuals[i] <= Math.max(1.5 * rms, 1.5));
    if (inliers.length >= 6) line = solve(inliers);
    return line;
}

/**
 * Affine transform (a,b,c,d,e,f) mapping source triangle s0,s1,s2 onto dest triangle d0,d1,d2,
 * i.e. the canvas CTM under which drawImage places source pixel s_i at d_i. Null if degenerate.
 *
 * @param s0
 * @param s1
 * @param s2
 * @param d0
 * @param d1
 * @param d2
 * @returns
 */
function affineFromTriangles(
    s0: QuadPoint,
    s1: QuadPoint,
    s2: QuadPoint,
    d0: QuadPoint,
    d1: QuadPoint,
    d2: QuadPoint,
): { a: number; b: number; c: number; d: number; e: number; f: number } | null {
    const a1 = s0.x - s2.x,
        b1 = s0.y - s2.y;
    const a2 = s1.x - s2.x,
        b2 = s1.y - s2.y;
    const den = a1 * b2 - a2 * b1;
    if (Math.abs(den) < 1e-9) return null;
    const cx1 = d0.x - d2.x,
        cx2 = d1.x - d2.x;
    const cy1 = d0.y - d2.y,
        cy2 = d1.y - d2.y;
    const a = (cx1 * b2 - cx2 * b1) / den;
    const c = (a1 * cx2 - a2 * cx1) / den;
    const b = (cy1 * b2 - cy2 * b1) / den;
    const d = (a1 * cy2 - a2 * cy1) / den;
    return { a, b, c, d, e: d2.x - a * s2.x - c * s2.y, f: d2.y - b * s2.x - d * s2.y };
}

/**
 * Perspective-dewarp the card quad to a flat NORMALIZED_CARD_WIDTH×HEIGHT image by warping the
 *  quad's two triangles onto the output rectangle. This rectifies a rotated/tilted card so its
 *  signature lines up with the (flat) reference index — used as an extra matcher variant.
 *
 * @param source
 * @param quad
 * @returns
 */
function warpQuadToCard(source: CanvasImageSource, quad: CardQuad): ScratchCanvas | null {
    const width = NORMALIZED_CARD_WIDTH;
    const height = NORMALIZED_CARD_HEIGHT;
    const canvas = createCanvas(width, height);
    const context = context2d(canvas);
    if (!context) return null;
    // Inset a hair toward the centre so the very card edge / background is not sampled.
    const cx = (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4;
    const cy = (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4;
    const inset = (p: QuadPoint): QuadPoint => ({ x: p.x + (cx - p.x) * 0.008, y: p.y + (cy - p.y) * 0.008 });
    const tl = inset(quad.topLeft),
        tr = inset(quad.topRight),
        br = inset(quad.bottomRight),
        bl = inset(quad.bottomLeft);
    const dTL = { x: 0, y: 0 },
        dTR = { x: width, y: 0 },
        dBR = { x: width, y: height },
        dBL = { x: 0, y: height };
    const drawTriangle = (s0: QuadPoint, s1: QuadPoint, s2: QuadPoint, d0: QuadPoint, d1: QuadPoint, d2: QuadPoint) => {
        const m = affineFromTriangles(s0, s1, s2, d0, d1, d2);
        if (!m) return;
        context.save();
        context.beginPath();
        context.moveTo(d0.x, d0.y);
        context.lineTo(d1.x, d1.y);
        context.lineTo(d2.x, d2.y);
        context.closePath();
        context.clip();
        context.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        context.drawImage(source, 0, 0);
        context.restore();
    };
    drawTriangle(tl, tr, br, dTL, dTR, dBR);
    drawTriangle(tl, br, bl, dTL, dBR, dBL);
    return canvas;
}

/**
 * Refine the axis-aligned {@link detectCardBounds} box into a perspective-correct quad by
 *  fitting a straight line to each of the four card edges. For every side we scan a narrow band
 *  around the detected edge for the strongest HIGH-CONTRAST transition per row/column and fit a
 *  line through those points, then intersect adjacent edges to get the corners. Anchoring the
 *  search to the detected box keeps it on the card (no over-shooting onto table/deck-box/playmat
 *  lines the way a global line search does), while the per-edge fit recovers rotation and
 *  perspective. A fit that wanders too far from the box falls back to the axis-aligned rectangle.
 *  Returns the quad in source-pixel coordinates, or null if no card box was detected at all.
 *
 * @param source
 * @returns the detected quad, or null if none was found
 */
export function detectCardQuadModel(source: CanvasImageSource): CardQuad | null {
    const dimensions = sourceDimensions(source);
    const bounds = detectCardBounds(source);
    if (!bounds) return null;
    const fallback = rectQuad(bounds.x, bounds.y, bounds.width, bounds.height);

    const scale = Math.min(1, EDGE_SAMPLE_SIZE / Math.max(dimensions.width, dimensions.height));
    const width = Math.max(8, Math.round(dimensions.width * scale));
    const height = Math.max(8, Math.round(dimensions.height * scale));
    const pixels = canvasPixels(source, width, height);
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1)
        gray[p] = grayscale(pixels[i], pixels[i + 1], pixels[i + 2]);

    const gradX = new Float32Array(width * height);
    const gradY = new Float32Array(width * height);
    let magSum = 0;
    let magSq = 0;
    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const o = y * width + x;
            const dx = gray[o + 1] - gray[o - 1];
            const dy = gray[o + width] - gray[o - width];
            gradX[o] = dx;
            gradY[o] = dy;
            const m = Math.hypot(dx, dy);
            magSum += m;
            magSq += m * m;
        }
    }
    const n = Math.max(1, (width - 2) * (height - 2));
    const magMean = magSum / n;
    const magStd = Math.sqrt(Math.max(0, magSq / n - magMean * magMean));
    const contrast = magMean + magStd * 0.5; // a fitted point must be a genuinely high-contrast edge

    const bx = bounds.x * scale;
    const by = bounds.y * scale;
    const bw = bounds.width * scale;
    const bh = bounds.height * scale;

    // Vertical side (left/right): strongest |∂x| per row within a band around the edge → x = a·y + b.
    const fitVertical = (edgeX: number): { a: number; b: number } => {
        const half = Math.max(4, bw * 0.1);
        const samples: Array<{ pos: number; coord: number }> = [];
        const y0 = Math.max(1, Math.round(by + bh * 0.1));
        const y1 = Math.min(height - 2, Math.round(by + bh * 0.9));
        const x0 = Math.max(1, Math.round(edgeX - half));
        const x1 = Math.min(width - 2, Math.round(edgeX + half));
        for (let y = y0; y <= y1; y += 1) {
            let bestX = -1;
            let bestVal = contrast;
            for (let x = x0; x <= x1; x += 1) {
                const v = Math.abs(gradX[y * width + x]);
                if (v > bestVal) {
                    bestVal = v;
                    bestX = x;
                }
            }
            if (bestX >= 0) samples.push({ pos: y, coord: bestX });
        }
        return fitEdgeLine(samples) ?? { a: 0, b: edgeX };
    };
    // Horizontal side (top/bottom): strongest |∂y| per column → y = a·x + b.
    const fitHorizontal = (edgeY: number): { a: number; b: number } => {
        const half = Math.max(4, bh * 0.1);
        const samples: Array<{ pos: number; coord: number }> = [];
        const x0 = Math.max(1, Math.round(bx + bw * 0.1));
        const x1 = Math.min(width - 2, Math.round(bx + bw * 0.9));
        const y0 = Math.max(1, Math.round(edgeY - half));
        const y1 = Math.min(height - 2, Math.round(edgeY + half));
        for (let x = x0; x <= x1; x += 1) {
            let bestY = -1;
            let bestVal = contrast;
            for (let y = y0; y <= y1; y += 1) {
                const v = Math.abs(gradY[y * width + x]);
                if (v > bestVal) {
                    bestVal = v;
                    bestY = y;
                }
            }
            if (bestY >= 0) samples.push({ pos: x, coord: bestY });
        }
        return fitEdgeLine(samples) ?? { a: 0, b: edgeY };
    };

    // Fitted edge lines, plus the axis-aligned anchor line for each side (the detected box edge).
    const fittedEdges = {
        left: fitVertical(bx),
        right: fitVertical(bx + bw),
        top: fitHorizontal(by),
        bottom: fitHorizontal(by + bh),
    };
    const anchorEdges = {
        left: { a: 0, b: bx },
        right: { a: 0, b: bx + bw },
        top: { a: 0, b: by },
        bottom: { a: 0, b: by + bh },
    };

    // Corner = intersection of a vertical line (x = a·y + b) with a horizontal line (y = a·x + b).
    const corner = (v: { a: number; b: number }, h: { a: number; b: number }): QuadPoint | null => {
        const denom = 1 - h.a * v.a;
        if (Math.abs(denom) < 1e-6) return null;
        const y = (h.a * v.b + h.b) / denom;
        return { x: (v.a * y + v.b) / scale, y: y / scale };
    };
    const angleBetween = (ax: number, ay: number, bx2: number, by2: number): number => {
        const cross = Math.hypot(ax, ay) * Math.hypot(bx2, by2);
        if (cross < 1e-6) return 180;
        const c = Math.max(-1, Math.min(1, (ax * bx2 + ay * by2) / cross));
        return (Math.acos(c) * 180) / Math.PI;
    };

    // Whether four edges intersect into a plausible Magic card, and how regular it is (lower =
    // better). A card, even under a hand-held photo's mild perspective, has near-parallel opposite
    // edges, ~90° corners, and the 63:88 aspect. An edge that latched onto an adjacent high-contrast
    // line (e.g. a deck-box rim) breaks these, so such a combination is rejected. Returns null if
    // the four lines do not form a valid card.
    const evaluateCard = (
        left: { a: number; b: number },
        right: { a: number; b: number },
        top: { a: number; b: number },
        bottom: { a: number; b: number },
    ): { quad: CardQuad; deviation: number } | null => {
        const tl = corner(left, top);
        const tr = corner(right, top);
        const br = corner(right, bottom);
        const bl = corner(left, bottom);
        if (!tl || !tr || !br || !bl) return null;
        const topV = { x: tr.x - tl.x, y: tr.y - tl.y };
        const botV = { x: br.x - bl.x, y: br.y - bl.y };
        const leftV = { x: bl.x - tl.x, y: bl.y - tl.y };
        const rightV = { x: br.x - tr.x, y: br.y - tr.y };
        const wTop = Math.hypot(topV.x, topV.y),
            wBot = Math.hypot(botV.x, botV.y);
        const hLeft = Math.hypot(leftV.x, leftV.y),
            hRight = Math.hypot(rightV.x, rightV.y);
        if (wTop < 4 || wBot < 4 || hLeft < 4 || hRight < 4) return null;
        const parTB = angleBetween(topV.x, topV.y, botV.x, botV.y);
        const parLR = angleBetween(leftV.x, leftV.y, rightV.x, rightV.y);
        // Opposite edges must stay near-parallel: consistent whole-card rotation keeps them parallel
        // (parallel angle ≈ 0 regardless of tilt); only an edge that latched onto a different line
        // (e.g. a deck-box rim) makes an opposite pair diverge, so a tight bound rejects exactly that.
        if (parTB > 5 || parLR > 5) return null;
        const corners = [
            angleBetween(topV.x, topV.y, leftV.x, leftV.y),
            angleBetween(-topV.x, -topV.y, rightV.x, rightV.y),
            angleBetween(-leftV.x, -leftV.y, botV.x, botV.y),
            angleBetween(-botV.x, -botV.y, -rightV.x, -rightV.y),
        ];
        if (corners.some((a) => a < 80 || a > 100)) return null; // ~right-angled corners
        const aspect = (wTop + wBot) / 2 / ((hLeft + hRight) / 2);
        if (aspect < 0.6 || aspect > 0.83) return null; // 63:88 card model
        const deviation = corners.reduce((s, a) => s + Math.abs(a - 90), 0) + parTB + parLR;
        return { quad: { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl }, deviation };
    };

    // Try every mix of fitted/anchor edge (16 combinations); keep the valid card that uses the MOST
    // fitted edges (max rotation/perspective recovery), breaking ties toward the most regular one.
    let best: CardQuad | null = null;
    let bestKey = -Infinity;
    for (let mask = 0; mask < 16; mask += 1) {
        const left = mask & 1 ? anchorEdges.left : fittedEdges.left;
        const right = mask & 2 ? anchorEdges.right : fittedEdges.right;
        const top = mask & 4 ? anchorEdges.top : fittedEdges.top;
        const bottom = mask & 8 ? anchorEdges.bottom : fittedEdges.bottom;
        const evaluated = evaluateCard(left, right, top, bottom);
        if (!evaluated) continue;
        const fittedCount = 4 - ((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1));
        const key = fittedCount * 100 - evaluated.deviation;
        if (key > bestKey) {
            bestKey = key;
            best = evaluated.quad;
        }
    }
    return best ?? fallback;
}

/**
 * Compute the geometry the scanner would use for this image — the axis-aligned crop, the
 *  perspective-dewarp trapezoid, and the OCR title rectangle — without running the full
 *  signature/OCR pipeline. Every shape mirrors exactly what the matching/OCR code crops, so the
 *  live overlay is a faithful debug view of what is actually fed to the algorithm.
 *
 * @param source
 * @returns the quads to draw over the photo
 */
export function createScanOverlay(source: CanvasImageSource): ScanOverlay {
    const dimensions = sourceDimensions(source);
    const sourceRatio = dimensions.width / dimensions.height;
    const alreadyCropped = Math.abs(sourceRatio - CARD_ASPECT_RATIO) < 0.025;
    if (alreadyCropped) {
        const full = rectQuad(0, 0, dimensions.width, dimensions.height);
        return { width: dimensions.width, height: dimensions.height, crop: full, perspective: null, ocr: full };
    }
    const bounds = detectCardBounds(source) ?? centeredCardBounds(dimensions.width, dimensions.height);
    // Green frame: anchored line-refinement (rotation/perspective), else the axis-aligned box.
    const crop = detectCardQuadModel(source) ?? rectQuad(bounds.x, bounds.y, bounds.width, bounds.height);
    // Old perspective variant the matcher also uses (orange), shown for comparison.
    const perspective = bounds.confidence > 0 ? perspectiveCardCorners(source, bounds) : null;
    // Mirror createTitleOcrSource exactly: 0.6% inset, then top 30% × left 68% of the bounds.
    const insetX = bounds.width * 0.006;
    const insetY = bounds.height * 0.006;
    const ocr = rectQuad(
        bounds.x + insetX,
        bounds.y + insetY,
        (bounds.width - insetX * 2) * OCR_TITLE_WIDTH_FRACTION,
        (bounds.height - insetY * 2) * OCR_TITLE_TOP_FRACTION,
    );
    return { width: dimensions.width, height: dimensions.height, crop, perspective, ocr };
}

/**
 * One signature per normalised rendering of a card photo
 *
 * @param source
 * @returns one signature per rendering
 */
export function createImageSignatureVariants(source: CanvasImageSource): ImageSignature[] {
    return createNormalizedCardVariantGroups(source).identification.map(signatureFromNormalizedCard);
}

/**
 * The signature groups a scan needs: one for identification, one for the printing stage
 *
 * @param source
 * @returns the identification and printing signature groups
 */
export function createScanSignatures(source: CanvasImageSource): {
    identification: ImageSignature[];
    printing: ImageSignature[];
} {
    const variants = createNormalizedCardVariantGroups(source);
    return {
        identification: variants.identification.map(signatureFromNormalizedCard),
        printing: variants.printing.map(signatureFromNormalizedCard),
    };
}

/**
 * Counts the set bits of a 32-bit word
 *
 * @param value
 * @returns
 */
function popcount32(value: number): number {
    let n = value - ((value >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Hamming distance between two hex-encoded hashes
 *
 * @param left
 * @param right
 * @returns the number of differing bits
 */
export function hammingDistance(left: string, right: string): number {
    // The perceptual hashes are 64-bit (16 hex chars). Comparing them as two 32-bit halves with
    // a bit-twiddling popcount is far faster than the previous BigInt loop — and this runs
    // millions of times per scan (3× per route over ~110k routes).
    const l = left.length === 16 ? left : left.padStart(16, "0");
    const r = right.length === 16 ? right : right.padStart(16, "0");
    const highXor = (parseInt(l.slice(0, 8), 16) ^ parseInt(r.slice(0, 8), 16)) >>> 0;
    const lowXor = (parseInt(l.slice(8, 16), 16) ^ parseInt(r.slice(8, 16), 16)) >>> 0;
    return popcount32(highXor) + popcount32(lowXor);
}

/**
 * Euclidean distance between two colour vectors
 *
 * @param left
 * @param right
 * @returns
 */
function colorDistance(left: number[], right: number[]): number {
    const squared = left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
    return Math.min(1, Math.sqrt(squared) / 1.5);
}

/**
 * Similarity of two chroma vectors
 *
 * @param left
 * @param right
 * @returns
 */
function chromaSimilarity(left: number[], right: number[]): number {
    if (left.length !== 13 || right.length !== 13) return 0;
    const hueIntersection = left.slice(0, 12).reduce((sum, value, index) => sum + Math.min(value, right[index]), 0);
    const saturationScore = 1 - Math.min(1, Math.abs(left[12] - right[12]) * 2);
    return hueIntersection * 0.8 + saturationScore * 0.2;
}

/**
 * Similarity of two spatial-colour vectors
 *
 * @param left
 * @param right
 * @returns
 */
function spatialColorSimilarity(left: number[], right: number[]): number {
    if (left.length !== SPATIAL_COLOR_WIDTH * SPATIAL_COLOR_HEIGHT * 3 || right.length !== left.length) {
        return 0;
    }
    let best = 0;
    for (let shiftY = -1; shiftY <= 1; shiftY += 1) {
        for (let shiftX = -1; shiftX <= 1; shiftX += 1) {
            let distance = 0;
            let samples = 0;
            for (let y = 0; y < SPATIAL_COLOR_HEIGHT; y += 1) {
                const rightY = y + shiftY;
                if (rightY < 0 || rightY >= SPATIAL_COLOR_HEIGHT) continue;
                for (let x = 0; x < SPATIAL_COLOR_WIDTH; x += 1) {
                    const rightX = x + shiftX;
                    if (rightX < 0 || rightX >= SPATIAL_COLOR_WIDTH) continue;
                    const leftOffset = (y * SPATIAL_COLOR_WIDTH + x) * 3;
                    const rightOffset = (rightY * SPATIAL_COLOR_WIDTH + rightX) * 3;
                    const red = left[leftOffset] - right[rightOffset];
                    const green = left[leftOffset + 1] - right[rightOffset + 1];
                    const blue = left[leftOffset + 2] - right[rightOffset + 2];
                    distance += Math.sqrt(red * red + green * green + blue * blue) / Math.SQRT2;
                    samples += 1;
                }
            }
            const overlap = samples / (SPATIAL_COLOR_WIDTH * SPATIAL_COLOR_HEIGHT);
            best = Math.max(best, (1 - distance / Math.max(1, samples)) * (0.92 + overlap * 0.08));
        }
    }
    return best;
}

/**
 * One query grid with the shift-search terms that depend only on the query precomputed: for each
 *  candidate shift, the overlap size and the query's sum / sum-of-squares over that overlap.
 *  Those are identical for every card the query is compared against, so hoisting them out saves
 *  two of the five accumulations in the innermost loop of the 1200-candidate fine ranking.
 */
type GridQuery = {
    values: number[];
    width: number;
    height: number;
    maximumShiftX: number;
    maximumShiftY: number;
    counts: Int32Array;
    sums: Float64Array;
    squareSums: Float64Array;
};

/**
 * Mean-centres a grid vector and precomputes its norm, so similarity is a dot product
 *
 * @param values
 * @param width
 * @param height
 * @param maximumShiftX
 * @param maximumShiftY
 * @returns
 */
function prepareGrid(
    values: number[],
    width: number,
    height: number,
    maximumShiftX: number,
    maximumShiftY: number,
): GridQuery {
    const shiftsX = maximumShiftX * 2 + 1;
    const shiftsY = maximumShiftY * 2 + 1;
    const query: GridQuery = {
        values,
        width,
        height,
        maximumShiftX,
        maximumShiftY,
        counts: new Int32Array(shiftsX * shiftsY),
        sums: new Float64Array(shiftsX * shiftsY),
        squareSums: new Float64Array(shiftsX * shiftsY),
    };
    if (values.length !== width * height) return query;
    for (let shiftY = -maximumShiftY; shiftY <= maximumShiftY; shiftY += 1) {
        for (let shiftX = -maximumShiftX; shiftX <= maximumShiftX; shiftX += 1) {
            let count = 0;
            let sum = 0;
            let squareSum = 0;
            // Same traversal order as the scoring loop below, so the accumulated sums are bit-identical.
            for (let y = 0; y < height; y += 1) {
                const rightY = y + shiftY;
                if (rightY < 0 || rightY >= height) continue;
                for (let x = 0; x < width; x += 1) {
                    const rightX = x + shiftX;
                    if (rightX < 0 || rightX >= width) continue;
                    const value = values[y * width + x];
                    count += 1;
                    sum += value;
                    squareSum += value * value;
                }
            }
            const slot = (shiftY + maximumShiftY) * shiftsX + (shiftX + maximumShiftX);
            query.counts[slot] = count;
            query.sums[slot] = sum;
            query.squareSums[slot] = squareSum;
        }
    }
    return query;
}

/**
 * Similarity of a prepared query grid against a raw grid vector
 *
 * @param query
 * @param right
 * @returns
 */
function gridSimilarityWithQuery(query: GridQuery, right: number[]): number {
    const { values: left, width, height, maximumShiftX, maximumShiftY } = query;
    if (left.length !== width * height || right.length !== left.length) return 0;
    const shiftsX = maximumShiftX * 2 + 1;
    let bestCorrelation = -1;

    // The detected photo may start a few percent inside the real card. Searching small
    // translations makes the comparison robust without losing the artwork detail.
    for (let shiftY = -maximumShiftY; shiftY <= maximumShiftY; shiftY += 1) {
        for (let shiftX = -maximumShiftX; shiftX <= maximumShiftX; shiftX += 1) {
            const slot = (shiftY + maximumShiftY) * shiftsX + (shiftX + maximumShiftX);
            const count = query.counts[slot];
            const leftSum = query.sums[slot];
            const leftSquareSum = query.squareSums[slot];
            let rightSum = 0;
            let rightSquareSum = 0;
            let productSum = 0;

            for (let y = 0; y < height; y += 1) {
                const rightY = y + shiftY;
                if (rightY < 0 || rightY >= height) continue;
                for (let x = 0; x < width; x += 1) {
                    const rightX = x + shiftX;
                    if (rightX < 0 || rightX >= width) continue;
                    const leftValue = left[y * width + x];
                    const rightValue = right[rightY * width + rightX];
                    rightSum += rightValue;
                    rightSquareSum += rightValue * rightValue;
                    productSum += leftValue * rightValue;
                }
            }

            const numerator = count * productSum - leftSum * rightSum;
            const denominator = Math.sqrt(
                Math.max(0, count * leftSquareSum - leftSum * leftSum) *
                    Math.max(0, count * rightSquareSum - rightSum * rightSum),
            );
            if (denominator > 0) {
                const overlap = count / (width * height);
                const correlation = (numerator / denominator) * (0.9 + overlap * 0.1);
                bestCorrelation = Math.max(bestCorrelation, correlation);
            }
        }
    }

    return Math.max(0, Math.min(1, (bestCorrelation + 1) / 2));
}

/**
 * Similarity of two grid vectors
 *
 * @param left
 * @param right
 * @param width
 * @param height
 * @param maximumShiftX
 * @param maximumShiftY
 * @returns
 */
function gridSimilarity(
    left: number[],
    right: number[],
    width: number,
    height: number,
    maximumShiftX: number,
    maximumShiftY: number,
): number {
    return gridSimilarityWithQuery(prepareGrid(left, width, height, maximumShiftX, maximumShiftY), right);
}

/**
 * Every component of the similarity score, for tuning and for the regression harness
 *
 * @param left
 * @param right
 * @returns every component of the score
 */
export function signatureSimilarityBreakdown(left: ImageSignature, right: ImageSignature) {
    const differenceScore = 1 - hammingDistance(left.differenceHash, right.differenceHash) / 64;
    const averageScore = 1 - hammingDistance(left.averageHash, right.averageHash) / 64;
    const artworkHashScore = 1 - hammingDistance(left.artworkHash, right.artworkHash) / 64;
    const detailScore = gridSimilarity(left.detailVector, right.detailVector, DETAIL_WIDTH, DETAIL_HEIGHT, 2, 3);
    const artworkScore = gridSimilarity(left.artworkVector, right.artworkVector, ARTWORK_WIDTH, ARTWORK_HEIGHT, 2, 2);
    const artworkEdgeScore = gridSimilarity(
        left.artworkEdgeVector,
        right.artworkEdgeVector,
        ARTWORK_EDGE_WIDTH,
        ARTWORK_EDGE_HEIGHT,
        3,
        3,
    );
    const spatialColorScore = spatialColorSimilarity(left.spatialColorVector, right.spatialColorVector);
    const titleScore = gridSimilarity(left.titleVector, right.titleVector, TITLE_WIDTH, TITLE_HEIGHT, 3, 1);
    const setSymbolScore = gridSimilarity(left.setSymbolVector, right.setSymbolVector, 16, 16, 2, 2);
    const footerScore = gridSimilarity(left.footerVector, right.footerVector, 40, 8, 3, 1);
    const stampScore = gridSimilarity(left.stampVector, right.stampVector, 20, 20, 3, 3);
    const chromaScore = chromaSimilarity(left.chromaVector, right.chromaVector);
    const edgeScore = gridSimilarity(left.edgeVector, right.edgeVector, EDGE_DETAIL_WIDTH, EDGE_DETAIL_HEIGHT, 3, 4);
    const colorScore = 1 - colorDistance(left.colorVector, right.colorVector);
    const similarity = Math.max(
        0,
        Math.min(
            1,
            artworkEdgeScore * 0.15 +
                edgeScore * 0.2 +
                artworkHashScore * 0.02 +
                artworkScore * 0.15 +
                spatialColorScore * 0.1 +
                titleScore * 0.25 +
                detailScore * 0.02 +
                chromaScore * 0.05 +
                differenceScore * 0.01 +
                averageScore * 0.03 +
                colorScore * 0.02,
        ),
    );
    const focusedSimilarity = Math.max(
        0,
        Math.min(
            1,
            artworkEdgeScore * 0.4 +
                edgeScore * 0.15 +
                artworkHashScore * 0.05 +
                artworkScore * 0.05 +
                spatialColorScore * 0.08 +
                titleScore * 0.12 +
                detailScore * 0.02 +
                chromaScore * 0.04 +
                differenceScore * 0.02 +
                averageScore * 0.04 +
                colorScore * 0.03,
        ),
    );
    return {
        similarity,
        focusedSimilarity,
        edgeScore,
        artworkScore,
        artworkEdgeScore,
        artworkHashScore,
        spatialColorScore,
        titleScore,
        setSymbolScore,
        footerScore,
        stampScore,
        detailScore,
        chromaScore,
        differenceScore,
        averageScore,
        colorScore,
    };
}

/**
 * Lean fine-ranking scorer: computes exactly the sub-scores that feed `similarity` and
 *  `focusedSimilarity`, and nothing else. `signatureSimilarityBreakdown` also correlates the
 *  set-symbol, footer and stamp grids, but those never enter either combined score (they exist
 *  for the diagnostics object and for `printingSimilarity`) — skipping them drops ~1000 dims of
 *  shift-searched cross-correlation per candidate in the 1200-candidate fine-ranking loop.
 *  The returned values are bit-identical to the breakdown's `similarity`/`focusedSimilarity`.
 */
/**
 * Prepared query grids for one scanned signature, reused across every candidate it is ranked
 *  against. Keyed weakly by the signature object, so it lives exactly as long as the scan does.
 */
type FineRankQuery = {
    detail: GridQuery;
    artwork: GridQuery;
    artworkEdge: GridQuery;
    title: GridQuery;
    edge: GridQuery;
};
const fineRankQueries = new WeakMap<ImageSignature, FineRankQuery>();

/**
 * Precomputes everything the fine rank needs from the query signature
 *
 * @param signature
 * @returns
 */
function fineRankQuery(signature: ImageSignature): FineRankQuery {
    const existing = fineRankQueries.get(signature);
    if (existing) return existing;
    const query: FineRankQuery = {
        detail: prepareGrid(signature.detailVector, DETAIL_WIDTH, DETAIL_HEIGHT, 2, 3),
        artwork: prepareGrid(signature.artworkVector, ARTWORK_WIDTH, ARTWORK_HEIGHT, 2, 2),
        artworkEdge: prepareGrid(signature.artworkEdgeVector, ARTWORK_EDGE_WIDTH, ARTWORK_EDGE_HEIGHT, 3, 3),
        title: prepareGrid(signature.titleVector, TITLE_WIDTH, TITLE_HEIGHT, 3, 1),
        edge: prepareGrid(signature.edgeVector, EDGE_DETAIL_WIDTH, EDGE_DETAIL_HEIGHT, 3, 4),
    };
    fineRankQueries.set(signature, query);
    return query;
}

/**
 * How alike two cards' **artwork** is, ignoring everything they would share anyway.
 *
 *  Used to choose between printings once the card's name is already known. The general
 *  `similarity` is the wrong tool there: a quarter of it is the title region, which is identical
 *  on every printing of the same card and therefore contributes noise rather than signal — which
 *  is why nine Nazgûl printings used to land within 0.005 of each other. Here only the art and
 *  the colour it casts over the card are compared.
 *
 * @param left
 * @param right
 * @returns the artwork-only similarity
 */
export function artworkSimilarity(left: ImageSignature, right: ImageSignature): number {
    const query = fineRankQuery(left);
    const artworkHashScore = 1 - hammingDistance(left.artworkHash, right.artworkHash) / 64;
    const artworkScore = gridSimilarityWithQuery(query.artwork, right.artworkVector);
    const artworkEdgeScore = gridSimilarityWithQuery(query.artworkEdge, right.artworkEdgeVector);
    const spatialColorScore = spatialColorSimilarity(left.spatialColorVector, right.spatialColorVector);
    const chromaScore = chromaSimilarity(left.chromaVector, right.chromaVector);
    return Math.max(
        0,
        Math.min(
            1,
            artworkEdgeScore * 0.45 +
                artworkScore * 0.25 +
                spatialColorScore * 0.15 +
                artworkHashScore * 0.1 +
                chromaScore * 0.05,
        ),
    );
}

/**
 * Scores a candidate against a prepared query (the fine ranking stage)
 *
 * @param left
 * @param right
 * @returns the fine score, higher is closer
 */
export function fineRankScore(
    left: ImageSignature,
    right: ImageSignature,
): { similarity: number; focusedSimilarity: number } {
    const query = fineRankQuery(left);
    const differenceScore = 1 - hammingDistance(left.differenceHash, right.differenceHash) / 64;
    const averageScore = 1 - hammingDistance(left.averageHash, right.averageHash) / 64;
    const artworkHashScore = 1 - hammingDistance(left.artworkHash, right.artworkHash) / 64;
    const detailScore = gridSimilarityWithQuery(query.detail, right.detailVector);
    const artworkScore = gridSimilarityWithQuery(query.artwork, right.artworkVector);
    const artworkEdgeScore = gridSimilarityWithQuery(query.artworkEdge, right.artworkEdgeVector);
    const spatialColorScore = spatialColorSimilarity(left.spatialColorVector, right.spatialColorVector);
    const titleScore = gridSimilarityWithQuery(query.title, right.titleVector);
    const chromaScore = chromaSimilarity(left.chromaVector, right.chromaVector);
    const edgeScore = gridSimilarityWithQuery(query.edge, right.edgeVector);
    const colorScore = 1 - colorDistance(left.colorVector, right.colorVector);
    const similarity = Math.max(
        0,
        Math.min(
            1,
            artworkEdgeScore * 0.15 +
                edgeScore * 0.2 +
                artworkHashScore * 0.02 +
                artworkScore * 0.15 +
                spatialColorScore * 0.1 +
                titleScore * 0.25 +
                detailScore * 0.02 +
                chromaScore * 0.05 +
                differenceScore * 0.01 +
                averageScore * 0.03 +
                colorScore * 0.02,
        ),
    );
    const focusedSimilarity = Math.max(
        0,
        Math.min(
            1,
            artworkEdgeScore * 0.4 +
                edgeScore * 0.15 +
                artworkHashScore * 0.05 +
                artworkScore * 0.05 +
                spatialColorScore * 0.08 +
                titleScore * 0.12 +
                detailScore * 0.02 +
                chromaScore * 0.04 +
                differenceScore * 0.02 +
                averageScore * 0.04 +
                colorScore * 0.03,
        ),
    );
    return { similarity, focusedSimilarity };
}

/**
 * How similar two cards look — the identification score
 *
 * @param left
 * @param right
 * @returns the identification score
 */
export function signatureSimilarity(left: ImageSignature, right: ImageSignature): number {
    return signatureSimilarityBreakdown(left, right).similarity;
}

/**
 * How similar two cards look on the axes that separate printings of the same card
 *
 * @param left
 * @param right
 * @returns the printing score
 */
export function printingSimilarity(left: ImageSignature, right: ImageSignature): number {
    const breakdown = signatureSimilarityBreakdown(left, right);
    return breakdown.stampScore * 0.65 + breakdown.setSymbolScore * 0.25 + breakdown.similarity * 0.1;
}

/**
 * Hash-only similarity, cheap enough for a first pass
 *
 * @param left
 * @param right
 * @returns
 */
function coarseHashSimilarity(left: ImageSignature, right: ImageSignature): number {
    const differenceScore = 1 - hammingDistance(left.differenceHash, right.differenceHash) / 64;
    const averageScore = 1 - hammingDistance(left.averageHash, right.averageHash) / 64;
    const artworkScore = 1 - hammingDistance(left.artworkHash, right.artworkHash) / 64;
    const chromaScore = chromaSimilarity(left.chromaVector, right.chromaVector);
    const artworkEdgeScore = gridSimilarity(
        left.artworkEdgeVector,
        right.artworkEdgeVector,
        ARTWORK_EDGE_WIDTH,
        ARTWORK_EDGE_HEIGHT,
        3,
        3,
    );
    return (
        differenceScore * 0.02 + averageScore * 0.01 + chromaScore * 0.05 + artworkScore * 0.02 + artworkEdgeScore * 0.9
    );
}

/**
 * Ranks a list of known cards against a query signature
 */
export function findMatches(signature: ImageSignature, cards: IndexedCard[], limit = 3): MatchCandidate[] {
    // A cheap hash shortlist replaces the old hard dominant-color cluster. Foil glare can
    // change the dominant channel, so color must never exclude the correct card outright.
    const shortlistSize = Math.min(cards.length, Math.max(192, limit));
    const candidates = cards
        .map((card) => ({ card, coarseScore: coarseHashSimilarity(signature, card.signature) }))
        .sort((left, right) => right.coarseScore - left.coarseScore)
        .slice(0, shortlistSize)
        .map(({ card }) => card);
    return candidates
        .map((card) => ({ card, similarity: signatureSimilarity(signature, card.signature) }))
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, limit);
}

/**
 * Loads an image from a url
 *
 * @param source
 * @returns the loaded image
 */
export function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Das Bild konnte nicht geladen werden."));
        image.src = source;
    });
}
