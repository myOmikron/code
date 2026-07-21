import type { ImageSignature, IndexedCard, MatchCandidate } from "./types";

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

export type CardBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type EdgeMaps = {
  vertical: Float32Array;
  horizontal: Float32Array;
  width: number;
};

function canvasPixels(source: CanvasImageSource, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function canvasRegionPixels(
  source: CanvasImageSource,
  region: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
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

function grayscale(red: number, green: number, blue: number): number {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function sourceDimensions(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return {
    width: "width" in source ? Number(source.width) : NORMALIZED_CARD_WIDTH,
    height: "height" in source ? Number(source.height) : NORMALIZED_CARD_HEIGHT,
  };
}

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

function strongestPeaks(values: number[], limit = 24): number[] {
  return values
    .map((value, index) => ({ value, index }))
    .filter(({ index, value }) =>
      index > 1 &&
      index < values.length - 2 &&
      value >= values[index - 1] &&
      value >= values[index + 1],
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
  function enclosureImbalance(bounds: CardBounds): number {
    const leftMargin = innerFrame.x - bounds.x;
    const rightMargin = bounds.x + bounds.width - (innerFrame.x + innerFrame.width);
    const topMargin = innerFrame.y - bounds.y;
    const bottomMargin = bounds.y + bounds.height - (innerFrame.y + innerFrame.height);
    return (
      Math.abs(leftMargin - rightMargin) / bounds.width +
      Math.abs(topMargin - bottomMargin) / bounds.height
    );
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

export function detectCardBounds(source: CanvasImageSource, allowEnclosingFrame = true): CardBounds | null {
  const dimensions = sourceDimensions(source);
  const scale = Math.min(1, EDGE_SAMPLE_SIZE / Math.max(dimensions.width, dimensions.height));
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
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

  const bounds = selectCardBounds(verticalEdges, horizontalEdges, {
    vertical: verticalMap,
    horizontal: horizontalMap,
    width,
  }, allowEnclosingFrame);
  if (!bounds) return null;
  return {
    x: bounds.x / scale,
    y: bounds.y / scale,
    width: bounds.width / scale,
    height: bounds.height / scale,
    confidence: bounds.confidence,
  };
}

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

function normalizeCardImage(source: CanvasImageSource, overrideBounds?: CardBounds): HTMLCanvasElement {
  const dimensions = sourceDimensions(source);
  const sourceRatio = dimensions.width / dimensions.height;
  const alreadyCropped = Math.abs(sourceRatio - CARD_ASPECT_RATIO) < 0.025;
  const bounds = overrideBounds ?? (alreadyCropped
    ? { x: 0, y: 0, width: dimensions.width, height: dimensions.height, confidence: Infinity }
    : detectCardBounds(source) ?? centeredCardBounds(dimensions.width, dimensions.height));
  // Move a fraction inside the detected edge so the background cannot influence the hash.
  const insetX = alreadyCropped ? 0 : bounds.width * 0.006;
  const insetY = alreadyCropped ? 0 : bounds.height * 0.006;
  const canvas = document.createElement("canvas");
  canvas.width = NORMALIZED_CARD_WIDTH;
  canvas.height = NORMALIZED_CARD_HEIGHT;
  const context = canvas.getContext("2d");
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

function perspectiveCardImage(source: CanvasImageSource, bounds: CardBounds): HTMLCanvasElement | null {
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
    const smoothed = strengths.map((value, index) =>
      (value + (strengths[index - 1] ?? value) + (strengths[index + 1] ?? value)) / 3,
    );
    const maximum = Math.max(...smoothed);
    const peaks = smoothed
      .map((value, index) => ({ value, x: startX + index }))
      .filter(({ value }, index) =>
        value >= maximum * 0.52 &&
        value >= (smoothed[index - 1] ?? -Infinity) &&
        value >= (smoothed[index + 1] ?? -Infinity),
      );
    if (!peaks.length) return center;
    return (leftSide ? peaks[0] : peaks[peaks.length - 1]).x;
  }

  const topLeft = sidePeak(0.02, 0.28, true) / scale;
  const bottomLeft = sidePeak(0.72, 0.98, true) / scale;
  const topRight = sidePeak(0.02, 0.28, false) / scale;
  const bottomRight = sidePeak(0.72, 0.98, false) / scale;
  const canvas = document.createElement("canvas");
  canvas.width = NORMALIZED_CARD_WIDTH;
  canvas.height = NORMALIZED_CARD_HEIGHT;
  const context = canvas.getContext("2d");
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

function bitsToHex(bits: boolean[]): string {
  let value = 0n;
  for (const bit of bits) value = (value << 1n) | (bit ? 1n : 0n);
  return value.toString(16).padStart(Math.ceil(bits.length / 4), "0");
}

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

function averageHash(source: CanvasImageSource): string {
  const pixels = canvasPixels(source, 8, 8);
  const values: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    values.push(grayscale(pixels[index], pixels[index + 1], pixels[index + 2]));
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return bitsToHex(values.map((value) => value >= average));
}

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

function detailSignature(source: CanvasImageSource): number[] {
  const pixels = canvasPixels(source, DETAIL_WIDTH, DETAIL_HEIGHT);
  const details: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    details.push(grayscale(pixels[index], pixels[index + 1], pixels[index + 2]) / 255);
  }
  return details;
}

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

  return [
    ...hueBuckets.map((value) => value / Math.max(totalWeight, 0.001)),
    saturationTotal / (pixels.length / 4),
  ];
}

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
    setSymbolVector: regionEdgeSignature(
      normalizedCard,
      { x: 0.82, y: 0.42, width: 0.15, height: 0.13 },
      16,
      16,
    ),
    footerVector: regionEdgeSignature(
      normalizedCard,
      { x: 0.04, y: 0.88, width: 0.92, height: 0.1 },
      40,
      8,
    ),
    stampVector: regionEdgeSignature(
      normalizedCard,
      { x: 0.015, y: 0.84, width: 0.2, height: 0.145 },
      20,
      20,
    ),
    chromaVector: chromaSignature(normalizedCard),
    edgeVector: edgeSignature(normalizedCard),
    ...colorSignature(normalizedCard),
  };
}

export function createImageSignature(source: CanvasImageSource): ImageSignature {
  return signatureFromNormalizedCard(normalizeCardImage(source));
}

function createNormalizedCardVariantGroups(source: CanvasImageSource): {
  identification: HTMLCanvasElement[];
  printing: HTMLCanvasElement[];
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
    if (refinedBounds && refinedBounds.width * refinedBounds.height < NORMALIZED_CARD_WIDTH * NORMALIZED_CARD_HEIGHT * 0.96) {
      printing.push(normalizeCardImage(perspective, refinedBounds));
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

export function createNormalizedCardVariants(source: CanvasImageSource): HTMLCanvasElement[] {
  return createNormalizedCardVariantGroups(source).printing;
}

export function createImageSignatureVariants(source: CanvasImageSource): ImageSignature[] {
  return createNormalizedCardVariantGroups(source).identification.map(signatureFromNormalizedCard);
}

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

export function hammingDistance(left: string, right: string): number {
  let xor = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

function colorDistance(left: number[], right: number[]): number {
  const squared = left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
  return Math.min(1, Math.sqrt(squared) / 1.5);
}

function chromaSimilarity(left: number[], right: number[]): number {
  if (left.length !== 13 || right.length !== 13) return 0;
  const hueIntersection = left.slice(0, 12).reduce(
    (sum, value, index) => sum + Math.min(value, right[index]),
    0,
  );
  const saturationScore = 1 - Math.min(1, Math.abs(left[12] - right[12]) * 2);
  return hueIntersection * 0.8 + saturationScore * 0.2;
}

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

function gridSimilarity(
  left: number[],
  right: number[],
  width: number,
  height: number,
  maximumShiftX: number,
  maximumShiftY: number,
): number {
  if (left.length !== width * height || right.length !== left.length) return 0;
  let bestCorrelation = -1;

  // The detected photo may start a few percent inside the real card. Searching small
  // translations makes the comparison robust without losing the artwork detail.
  for (let shiftY = -maximumShiftY; shiftY <= maximumShiftY; shiftY += 1) {
    for (let shiftX = -maximumShiftX; shiftX <= maximumShiftX; shiftX += 1) {
      let count = 0;
      let leftSum = 0;
      let rightSum = 0;
      let leftSquareSum = 0;
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
          count += 1;
          leftSum += leftValue;
          rightSum += rightValue;
          leftSquareSum += leftValue * leftValue;
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

export function signatureSimilarityBreakdown(left: ImageSignature, right: ImageSignature) {
  const differenceScore = 1 - hammingDistance(left.differenceHash, right.differenceHash) / 64;
  const averageScore = 1 - hammingDistance(left.averageHash, right.averageHash) / 64;
  const artworkHashScore = 1 - hammingDistance(left.artworkHash, right.artworkHash) / 64;
  const detailScore = gridSimilarity(left.detailVector, right.detailVector, DETAIL_WIDTH, DETAIL_HEIGHT, 2, 3);
  const artworkScore = gridSimilarity(
    left.artworkVector,
    right.artworkVector,
    ARTWORK_WIDTH,
    ARTWORK_HEIGHT,
    2,
    2,
  );
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
  const edgeScore = gridSimilarity(
    left.edgeVector,
    right.edgeVector,
    EDGE_DETAIL_WIDTH,
    EDGE_DETAIL_HEIGHT,
    3,
    4,
  );
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

export function signatureSimilarity(left: ImageSignature, right: ImageSignature): number {
  return signatureSimilarityBreakdown(left, right).similarity;
}

export function printingSimilarity(left: ImageSignature, right: ImageSignature): number {
  const breakdown = signatureSimilarityBreakdown(left, right);
  return breakdown.stampScore * 0.65 + breakdown.setSymbolScore * 0.25 + breakdown.similarity * 0.1;
}

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
  return differenceScore * 0.02 + averageScore * 0.01 + chromaScore * 0.05 + artworkScore * 0.02 + artworkEdgeScore * 0.9;
}

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

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Das Bild konnte nicht geladen werden."));
    image.src = source;
  });
}
