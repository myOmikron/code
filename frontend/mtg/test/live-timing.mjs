// test/live-timing.ts
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";

// src/scanner/opencv.ts
var pending = null;
async function loadOpenCv() {
  pending ??= (async () => {
    const imported = (await import("@techstark/opencv-js")).default;
    if (imported instanceof Promise) return imported;
    const module = imported;
    if (module.Mat) return module;
    await new Promise((resolve) => {
      module.onRuntimeInitialized = resolve;
    });
    return module;
  })();
  return pending;
}
function withMats(body) {
  const owned = [];
  try {
    return body((mat) => {
      owned.push(mat);
      return mat;
    });
  } finally {
    for (const mat of owned.reverse()) {
      try {
        mat.delete();
      } catch {
      }
    }
  }
}

// src/scanner/image-quality.ts
async function equaliseLocalContrast(image, clip = 4) {
  const cv = await loadOpenCv();
  return withMats((track) => {
    const rgba = track(cv.matFromImageData(image));
    const lab = track(new cv.Mat());
    cv.cvtColor(rgba, lab, cv.COLOR_RGB2Lab);
    const channels = track(new cv.MatVector());
    cv.split(lab, channels);
    const lightness = track(channels.get(0));
    const clahe = track(new cv.CLAHE(clip, new cv.Size(8, 8)));
    clahe.apply(lightness, lightness);
    channels.set(0, lightness);
    cv.merge(channels, lab);
    const rgb = track(new cv.Mat());
    cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
    const out = track(new cv.Mat());
    cv.cvtColor(rgb, out, cv.COLOR_RGB2RGBA);
    return { data: new Uint8ClampedArray(out.data), width: image.width, height: image.height };
  });
}

// src/scanner/embedding.ts
var PREPROCESSING = "area224";
var IMAGE_SIZE = 224;
var HIDDEN_DIM = 384;
var EMBEDDING_DIM = HIDDEN_DIM * 2;
var MEAN = [0.485, 0.456, 0.406];
var STD = [0.229, 0.224, 0.225];
function preprocess(image) {
  const { data: data2, width: width2, height } = image;
  const pixels2 = IMAGE_SIZE * IMAGE_SIZE;
  const output = new Float32Array(3 * pixels2);
  for (let y = 0; y < IMAGE_SIZE; y += 1) {
    const fromY = Math.floor(y * height / IMAGE_SIZE);
    const toY = Math.max(fromY + 1, Math.floor((y + 1) * height / IMAGE_SIZE));
    for (let x = 0; x < IMAGE_SIZE; x += 1) {
      const fromX = Math.floor(x * width2 / IMAGE_SIZE);
      const toX = Math.max(fromX + 1, Math.floor((x + 1) * width2 / IMAGE_SIZE));
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sourceY = fromY; sourceY < toY; sourceY += 1) {
        let offset = (sourceY * width2 + fromX) * 4;
        for (let sourceX = fromX; sourceX < toX; sourceX += 1) {
          red += data2[offset];
          green += data2[offset + 1];
          blue += data2[offset + 2];
          offset += 4;
        }
      }
      const area = (toY - fromY) * (toX - fromX);
      const target = y * IMAGE_SIZE + x;
      output[target] = (red / area / 255 - MEAN[0]) / STD[0];
      output[pixels2 + target] = (green / area / 255 - MEAN[1]) / STD[1];
      output[2 * pixels2 + target] = (blue / area / 255 - MEAN[2]) / STD[2];
    }
  }
  return output;
}
function poolHidden(hidden, count, tokens) {
  const vectors = [];
  for (let item = 0; item < count; item += 1) {
    const base = item * tokens * HIDDEN_DIM;
    const vector = new Float32Array(EMBEDDING_DIM);
    let clsNorm = 0;
    for (let d = 0; d < HIDDEN_DIM; d += 1) {
      const value = hidden[base + d];
      vector[d] = value;
      clsNorm += value * value;
    }
    clsNorm = Math.sqrt(clsNorm) || 1;
    for (let d = 0; d < HIDDEN_DIM; d += 1) vector[d] /= clsNorm;
    let patchNorm = 0;
    for (let d = 0; d < HIDDEN_DIM; d += 1) {
      let sum = 0;
      for (let token = 1; token < tokens; token += 1) sum += hidden[base + token * HIDDEN_DIM + d];
      const value = sum / (tokens - 1);
      vector[HIDDEN_DIM + d] = value;
      patchNorm += value * value;
    }
    patchNorm = Math.sqrt(patchNorm) || 1;
    for (let d = 0; d < HIDDEN_DIM; d += 1) vector[HIDDEN_DIM + d] /= patchNorm;
    let norm = 0;
    for (let d = 0; d < EMBEDDING_DIM; d += 1) norm += vector[d] * vector[d];
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < EMBEDDING_DIM; d += 1) vector[d] /= norm;
    vectors.push(vector);
  }
  return vectors;
}
async function prepareForModel(image, variant = PREPROCESSING) {
  return preprocess(variant === "clahe4+area224" ? await equaliseLocalContrast(image) : image);
}

// src/scanner/embedding-index.ts
function createEmbeddingIndex(buffers, expected = PREPROCESSING) {
  const { manifest: manifest2, cards } = buffers;
  const { dim, count, sourceDim, scale } = manifest2;
  if (manifest2.preprocessing !== expected) {
    throw new Error(
      `Index wurde mit "${manifest2.preprocessing ?? "unbekannt"}" gebaut, die App erwartet "${expected}"`
    );
  }
  if (sourceDim !== EMBEDDING_DIM) {
    throw new Error(`Index erwartet ${sourceDim} Eingangsdimensionen, das Modell liefert ${EMBEDDING_DIM}`);
  }
  const projection = new Float32Array(buffers.projection);
  if (projection.length !== (dim + 1) * sourceDim) {
    throw new Error(`projection.f32 hat ${projection.length} Werte, erwartet ${(dim + 1) * sourceDim}`);
  }
  const vectors = new Int8Array(buffers.vectors);
  if (vectors.length !== count * dim) {
    throw new Error(`vectors.i8 hat ${vectors.length} Werte, erwartet ${count * dim}`);
  }
  if (cards.length !== count) {
    throw new Error(`cards.json hat ${cards.length} Eintr\xE4ge, erwartet ${count}`);
  }
  const project = (embedding) => {
    const centred = new Float32Array(sourceDim);
    for (let d = 0; d < sourceDim; d += 1) centred[d] = embedding[d] - projection[d];
    const output = new Float32Array(dim);
    let norm = 0;
    for (let component = 0; component < dim; component += 1) {
      const offset = (component + 1) * sourceDim;
      let sum = 0;
      for (let d = 0; d < sourceDim; d += 1) sum += centred[d] * projection[offset + d];
      output[component] = sum;
      norm += sum * sum;
    }
    norm = Math.sqrt(norm) || 1;
    for (let component = 0; component < dim; component += 1) output[component] /= norm;
    return output;
  };
  const search = (query, limit = 5) => {
    const quantised = new Int8Array(dim);
    for (let d = 0; d < dim; d += 1) {
      quantised[d] = Math.max(-127, Math.min(127, Math.round(query[d] * scale)));
    }
    const bestScores = new Float32Array(limit).fill(-Infinity);
    const bestRows = new Int32Array(limit).fill(-1);
    for (let row = 0; row < count; row += 1) {
      const offset = row * dim;
      let dot = 0;
      for (let d = 0; d < dim; d += 1) dot += quantised[d] * vectors[offset + d];
      if (dot <= bestScores[limit - 1]) continue;
      let slot = limit - 1;
      while (slot > 0 && bestScores[slot - 1] < dot) {
        bestScores[slot] = bestScores[slot - 1];
        bestRows[slot] = bestRows[slot - 1];
        slot -= 1;
      }
      bestScores[slot] = dot;
      bestRows[slot] = row;
    }
    const divisor = scale * scale;
    const matches = [];
    for (let rank = 0; rank < limit; rank += 1) {
      const row = bestRows[rank];
      if (row < 0) break;
      const card = cards[row];
      matches.push({
        score: bestScores[rank] / divisor,
        printing: {
          id: card.i,
          name: card.n,
          set: card.s,
          collectorNumber: card.c,
          lang: card.l,
          face: card.f
        }
      });
    }
    return matches;
  };
  return { manifest: manifest2, project, search };
}

// src/scanner/hough-quads.ts
var MIN_SEGMENT_FRACTION = 0.07;
var PARALLEL_TOLERANCE = 30 * Math.PI / 180;
var PERPENDICULAR_MINIMUM = 45 * Math.PI / 180;
var SUPPORT_BAND_FRACTION = 0.02;
var MAX_LINES = 32;
var ORIENTATION_BUCKETS = 12;
var PER_ORIENTATION = 4;
var MAX_SEGMENTS = 300;
var OUTSIDE_MARGIN = 0.06;
function foldAngle(radians) {
  const folded = radians % Math.PI;
  return folded < 0 ? folded + Math.PI : folded;
}
function angleDifference(first, second) {
  const raw = Math.abs(foldAngle(first) - foldAngle(second));
  return Math.min(raw, Math.PI - raw);
}
function findSegments(cv, edges, longSide) {
  const minLength = Math.max(20, longSide * MIN_SEGMENT_FRACTION);
  return withMats((track) => {
    const lines = track(new cv.Mat());
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 40, minLength, longSide * 0.03);
    const segments = [];
    const data2 = lines.data32S;
    const count = Math.floor(data2.length / 4);
    for (let index2 = 0; index2 < count; index2 += 1) {
      const a = { x: data2[index2 * 4], y: data2[index2 * 4 + 1] };
      const b = { x: data2[index2 * 4 + 2], y: data2[index2 * 4 + 3] };
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < minLength) continue;
      segments.push({ a, b, angle: foldAngle(Math.atan2(b.y - a.y, b.x - a.x)), length });
    }
    segments.sort((first, second) => second.length - first.length);
    return segments.slice(0, MAX_SEGMENTS);
  });
}
function distanceToLine(point, segment) {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return Infinity;
  return Math.abs(dy * (point.x - segment.a.x) - dx * (point.y - segment.a.y)) / length;
}
function mergeCollinear(segments, longSide) {
  const band = longSide * SUPPORT_BAND_FRACTION;
  const distinct = [];
  for (const segment of segments) {
    const duplicate = distinct.some(
      (kept) => angleDifference(kept.angle, segment.angle) < 10 * Math.PI / 180 && distanceToLine(segment.a, kept) < band && distanceToLine(segment.b, kept) < band
    );
    if (!duplicate) distinct.push(segment);
  }
  return distinct;
}
function selectDiverseLines(lines) {
  const perBucket = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const bucket = Math.min(
      ORIENTATION_BUCKETS - 1,
      Math.floor(foldAngle(line.angle) / Math.PI * ORIENTATION_BUCKETS)
    );
    const kept = perBucket.get(bucket) ?? [];
    if (kept.length < PER_ORIENTATION) {
      kept.push(line);
      perBucket.set(bucket, kept);
    }
  }
  return [...perBucket.values()].flat().sort((first, second) => second.length - first.length).slice(0, MAX_LINES);
}
function intersect(first, second) {
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
    y: (first2 * (y3 - y4) - (y1 - y2) * second2) / denominator
  };
}
function edgeSupport(quad, segments, longSide) {
  const band = longSide * SUPPORT_BAND_FRACTION;
  const sides = [
    [quad.topLeft, quad.topRight],
    [quad.topRight, quad.bottomRight],
    [quad.bottomRight, quad.bottomLeft],
    [quad.bottomLeft, quad.topLeft]
  ];
  let worst = 1;
  for (const [from, to] of sides) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return 0;
    const ux = dx / length;
    const uy = dy / length;
    const spans = [];
    for (const segment of segments) {
      const line = { a: from, b: to, angle: foldAngle(Math.atan2(dy, dx)), length };
      if (angleDifference(segment.angle, line.angle) > 12 * Math.PI / 180) continue;
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
function houghQuads(cv, edges, width2, height) {
  const longSide = Math.max(width2, height);
  const segments = findSegments(cv, edges, longSide);
  if (segments.length < 4) return [];
  const lines = selectDiverseLines(mergeCollinear(segments, longSide));
  if (lines.length < 4) return [];
  const opposites = [];
  for (let first = 0; first < lines.length; first += 1) {
    for (let second = first + 1; second < lines.length; second += 1) {
      if (angleDifference(lines[first].angle, lines[second].angle) <= PARALLEL_TOLERANCE) {
        opposites.push([lines[first], lines[second]]);
      }
    }
  }
  const margin = longSide * OUTSIDE_MARGIN;
  const results = [];
  for (let first = 0; first < opposites.length; first += 1) {
    for (let second = first + 1; second < opposites.length; second += 1) {
      const [a1, a2] = opposites[first];
      const [b1, b2] = opposites[second];
      const meanA = (a1.angle + a2.angle) / 2;
      const meanB = (b1.angle + b2.angle) / 2;
      if (angleDifference(meanA, meanB) < PERPENDICULAR_MINIMUM) continue;
      const corners = [intersect(a1, b1), intersect(a1, b2), intersect(a2, b2), intersect(a2, b1)];
      if (corners.some((corner) => corner === null)) continue;
      const points = corners;
      if (points.some(
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < -margin || point.y < -margin || point.x > width2 + margin || point.y > height + margin
      )) {
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

// src/scanner/card-detect.ts
var CARD_ASPECT = 63 / 88;
var ASPECT_TOLERANCE = 0.5;
var MIN_SIDE_SYMMETRY = 0.62;
var MIN_RECTANGULARITY = 0.75;
var CANNY_FACTORS = [0.6, 1, 1.6];
var AREA_SATURATION = 0.25;
var OVERLAP_REACH = 0.55;
var FRAME_SPAN_FRACTION = 0.95;
var MAX_ENCLOSING_GROWTH = 3.5;
var MIN_ENCLOSING_SCORE_RATIO = 0.2;
var RECOVERED_TOLERANCE = 0.16;
var AFFINE_THRESHOLD = 0.02;
var ASSUMED_FOCAL_FRACTION = 1 / 1.4;
var DEGENERATE_EPSILON = 1e-7;
var MAX_TILT_DEGREES = 42;
var BORDER_SAMPLES = 24;
var BORDER_OFFSET = 5;
var BORDER_STEP = 28;
var MIN_BORDER_CONTRAST = 0.45;
var RECTIFIED_WIDTH = 488;
var RECTIFIED_HEIGHT = 680;
var DEFAULTS = {
  workingSize: 720,
  minAreaFraction: 0.02,
  maxCards: 8
};
function hasFiniteCorners(quad) {
  return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].every(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  );
}
function areaPrior(areaFraction, minAreaFraction) {
  const span = Math.max(AREA_SATURATION - minAreaFraction, 1e-6);
  return 0.55 + 0.45 * Math.min(1, Math.max(0, (areaFraction - minAreaFraction) / span));
}
function borderContrast(quad, grey, colour, width2, height) {
  const sample = (x, y) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width2 || py >= height) return null;
    return py * width2 + px;
  };
  const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const centre = {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
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
    if ((midX + normalX - centre.x) ** 2 + (midY + normalY - centre.y) ** 2 < (midX - centre.x) ** 2 + (midY - centre.y) ** 2) {
      normalX = -normalX;
      normalY = -normalY;
    }
    let darker = 0;
    let lighter = 0;
    let counted = 0;
    for (let index2 = 1; index2 <= BORDER_SAMPLES; index2 += 1) {
      const t = index2 / (BORDER_SAMPLES + 1);
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      const outside = sample(x + normalX * BORDER_OFFSET, y + normalY * BORDER_OFFSET);
      const inside = sample(x - normalX * BORDER_OFFSET, y - normalY * BORDER_OFFSET);
      if (outside === null || inside === null) continue;
      counted += 1;
      const red = colour[inside * 4] - colour[outside * 4];
      const green = colour[inside * 4 + 1] - colour[outside * 4 + 1];
      const blue = colour[inside * 4 + 2] - colour[outside * 4 + 2];
      if (Math.hypot(red, green, blue) < BORDER_STEP) continue;
      if (grey[inside] < grey[outside]) darker += 1;
      else lighter += 1;
    }
    if (counted === 0) return 0;
    weakest = Math.min(weakest, Math.max(darker, lighter) / counted);
    if (weakest === 0) return 0;
  }
  return weakest;
}
function spansFrame(quad, width2, height) {
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  return spanX > width2 * FRAME_SPAN_FRACTION && spanY > height * FRAME_SPAN_FRACTION;
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function quadArea(quad) {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const doubled = points.reduce((sum, point, index2) => {
    const next = points[(index2 + 1) % 4];
    return sum + (point.x * next.y - next.x * point.y);
  }, 0);
  return Math.abs(doubled) / 2;
}
function scaleQuad(quad, factor) {
  const apply = (point) => ({ x: point.x * factor, y: point.y * factor });
  return {
    topLeft: apply(quad.topLeft),
    topRight: apply(quad.topRight),
    bottomRight: apply(quad.bottomRight),
    bottomLeft: apply(quad.bottomLeft)
  };
}
function shrinkQuad(quad, fraction) {
  const centre = {
    x: (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4,
    y: (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4
  };
  const scale = 1 - 2 * fraction;
  const apply = (point) => ({
    x: centre.x + (point.x - centre.x) * scale,
    y: centre.y + (point.y - centre.y) * scale
  });
  return {
    topLeft: apply(quad.topLeft),
    topRight: apply(quad.topRight),
    bottomRight: apply(quad.bottomRight),
    bottomLeft: apply(quad.bottomLeft)
  };
}
function orderCorners(points) {
  if (points.length !== 4) return null;
  const centre = {
    x: points.reduce((sum, point) => sum + point.x, 0) / 4,
    y: points.reduce((sum, point) => sum + point.y, 0) / 4
  };
  const cyclic = [...points].sort(
    (a, b) => Math.atan2(a.y - centre.y, a.x - centre.x) - Math.atan2(b.y - centre.y, b.x - centre.x)
  );
  const sides = cyclic.map((point, index2) => distance(point, cyclic[(index2 + 1) % 4]));
  if (sides.some((side) => side < 1)) return null;
  const shortPair = sides[0] + sides[2] <= sides[1] + sides[3] ? 0 : 1;
  const midY = (index2) => (cyclic[index2 % 4].y + cyclic[(index2 + 1) % 4].y) / 2;
  const start = midY(shortPair) <= midY(shortPair + 2) ? shortPair : shortPair + 2;
  const ordered = [0, 1, 2, 3].map((offset) => cyclic[(start + offset) % 4]);
  const signedArea = ordered.reduce((sum, point, index2) => {
    const next = ordered[(index2 + 1) % 4];
    return sum + (point.x * next.y - next.x * point.y);
  }, 0);
  const clockwise = signedArea > 0 ? ordered : [ordered[0], ordered[3], ordered[2], ordered[1]];
  return {
    topLeft: clockwise[0],
    topRight: clockwise[1],
    bottomRight: clockwise[2],
    bottomLeft: clockwise[3]
  };
}
function sideLengths(quad) {
  return {
    top: distance(quad.topLeft, quad.topRight),
    bottom: distance(quad.bottomLeft, quad.bottomRight),
    left: distance(quad.topLeft, quad.bottomLeft),
    right: distance(quad.topRight, quad.bottomRight)
  };
}
function recoverAspectRatio(quad, width2, height) {
  const centreX = width2 / 2;
  const centreY = height / 2;
  const toHomogeneous = (point) => [point.x - centreX, point.y - centreY, 1];
  const m1 = toHomogeneous(quad.topLeft);
  const m2 = toHomogeneous(quad.topRight);
  const m3 = toHomogeneous(quad.bottomLeft);
  const m4 = toHomogeneous(quad.bottomRight);
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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
  const assumed = (Math.hypot(width2, height) * ASSUMED_FOCAL_FRACTION) ** 2;
  const focalSquared = conditioning >= AFFINE_THRESHOLD && Number.isFinite(recovered) && recovered > 0 ? recovered : assumed;
  const horizontal = (n2[0] * n2[0] + n2[1] * n2[1]) / focalSquared + n2[2] * n2[2];
  const vertical = (n3[0] * n3[0] + n3[1] * n3[1]) / focalSquared + n3[2] * n3[2];
  if (vertical <= DEGENERATE_EPSILON || horizontal <= DEGENERATE_EPSILON) return null;
  return Math.sqrt(horizontal / vertical);
}
function rectangleScore(quad, width2, height) {
  const ratio = recoverAspectRatio(quad, width2, height);
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) return 0;
  return Math.max(0, 1 - Math.abs(ratio - CARD_ASPECT) / RECOVERED_TOLERANCE);
}
function uprightScore(quad) {
  const top = { x: quad.topRight.x - quad.topLeft.x, y: quad.topRight.y - quad.topLeft.y };
  const bottom = { x: quad.bottomRight.x - quad.bottomLeft.x, y: quad.bottomRight.y - quad.bottomLeft.y };
  const angle = (edge) => {
    const degrees = Math.atan2(edge.y, edge.x) * 180 / Math.PI;
    const folded = (degrees % 180 + 180) % 180;
    return folded > 90 ? 180 - folded : folded;
  };
  const tilt = (angle(top) + angle(bottom)) / 2;
  return Math.max(0, 1 - tilt / MAX_TILT_DEGREES);
}
function aspectScore(quad) {
  const { top, bottom, left, right } = sideLengths(quad);
  const width2 = (top + bottom) / 2;
  const height = (left + right) / 2;
  if (height < 1) return 0;
  return Math.max(0, 1 - Math.abs(width2 / height - CARD_ASPECT) / ASPECT_TOLERANCE);
}
function symmetryScore(quad) {
  const { top, bottom, left, right } = sideLengths(quad);
  const horizontal = Math.min(top, bottom) / Math.max(top, bottom, 1e-6);
  const vertical = Math.min(left, right) / Math.max(left, right, 1e-6);
  return Math.min(horizontal, vertical);
}
function quadFromContour(cv, contour) {
  return withMats((track) => {
    const hull = track(new cv.Mat());
    cv.convexHull(contour, hull, false, true);
    const perimeter = cv.arcLength(hull, true);
    if (perimeter < 40) return null;
    for (let epsilon = 0.01; epsilon <= 0.07; epsilon += 5e-3) {
      const approx = track(new cv.Mat());
      cv.approxPolyDP(hull, approx, epsilon * perimeter, true);
      if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
      const data2 = approx.data32S;
      return [0, 1, 2, 3].map((index2) => ({ x: data2[index2 * 2], y: data2[index2 * 2 + 1] }));
    }
    const corners = cv.boxPoints(cv.minAreaRect(hull));
    return corners.length === 4 ? corners.map((corner) => ({ x: corner.x, y: corner.y })) : null;
  });
}
function isInside(point, quad) {
  const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let positive = false;
  let negative = false;
  for (let index2 = 0; index2 < 4; index2 += 1) {
    const from = corners[index2];
    const to = corners[(index2 + 1) % 4];
    const cross = (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
    if (cross > 0) positive = true;
    if (cross < 0) negative = true;
    if (positive && negative) return false;
  }
  return true;
}
function cornersInside(inner, outer) {
  return [inner.topLeft, inner.topRight, inner.bottomRight, inner.bottomLeft].filter(
    (corner) => isInside(corner, outer)
  ).length;
}
function keepEnclosing(cards) {
  const centreOf = (quad) => ({
    x: (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4,
    y: (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4
  });
  const areas = cards.map((card) => quadArea(card.quad));
  const centres = cards.map((card) => centreOf(card.quad));
  const kept = [];
  for (let index2 = 0; index2 < cards.length; index2 += 1) {
    const overlapping = kept.findIndex(
      (other) => distance(centres[index2], centres[other]) < Math.sqrt(Math.max(areas[index2], areas[other])) * OVERLAP_REACH
    );
    if (overlapping === -1) {
      kept.push(index2);
      continue;
    }
    const incumbent = kept[overlapping];
    const enclosesIncumbent = areas[index2] > areas[incumbent] && areas[index2] <= areas[incumbent] * MAX_ENCLOSING_GROWTH && cards[index2].score >= cards[incumbent].score * MIN_ENCLOSING_SCORE_RATIO && cornersInside(cards[incumbent].quad, cards[index2].quad) >= 3;
    if (enclosesIncumbent) kept[overlapping] = index2;
  }
  return kept.map((index2) => cards[index2]);
}
async function detectCardsIn(pixels2, options = {}) {
  const { workingSize, minAreaFraction, maxCards } = { ...DEFAULTS, ...options };
  const { onCandidates, onRejects } = options;
  const rejects = {
    klein: 0,
    keinQuad: 0,
    ordnung: 0,
    endlich: 0,
    seitenverh\u00E4ltnis: 0,
    symmetrie: 0,
    kippung: 0,
    f\u00FCllung: 0,
    fl\u00E4cheKlein: 0,
    bildrahmen: 0,
    randkontrast: 0,
    rechteck: 0,
    angenommen: 0
  };
  const cv = await loadOpenCv();
  const scale = Math.min(1, workingSize / Math.max(pixels2.width, pixels2.height));
  const workWidth = Math.max(2, Math.round(pixels2.width * scale));
  const workHeight = Math.max(2, Math.round(pixels2.height * scale));
  const frameArea = workWidth * workHeight;
  return withMats((track) => {
    const full = track(cv.matFromImageData(pixels2));
    const rgba = track(new cv.Mat());
    cv.resize(full, rgba, new cv.Size(workWidth, workHeight), 0, 0, cv.INTER_AREA);
    const gray = track(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const greyPixels = new Uint8Array(gray.data);
    const colourPixels = new Uint8Array(rgba.data);
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    const binary = track(new cv.Mat());
    const otsu = cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
    const maps = [binary];
    const cannyMaps = [];
    const addCanny = (channel, level, factors) => {
      for (const factor of factors) {
        const edges = track(new cv.Mat());
        cv.Canny(channel, edges, Math.max(10, level * factor * 0.5), Math.max(30, level * factor));
        cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
        maps.push(edges);
        cannyMaps.push(edges);
      }
    };
    addCanny(blurred, otsu, CANNY_FACTORS);
    const hsv = track(new cv.Mat());
    const rgb = track(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    const hsvChannels = track(new cv.MatVector());
    cv.split(hsv, hsvChannels);
    const saturation = track(hsvChannels.get(1));
    const saturationBlurred = track(new cv.Mat());
    cv.GaussianBlur(saturation, saturationBlurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    addCanny(saturationBlurred, otsu, CANNY_FACTORS);
    const candidates = [];
    const consider = (quad, quality, count) => {
      if (!hasFiniteCorners(quad)) {
        if (count) rejects.endlich += 1;
        return false;
      }
      if (aspectScore(quad) <= 0) {
        if (count) rejects.seitenverh\u00E4ltnis += 1;
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
        if (count) rejects.fl\u00E4cheKlein += 1;
        return false;
      }
      const areaFraction = area / frameArea;
      if (spansFrame(quad, workWidth, workHeight)) {
        if (count) rejects.bildrahmen += 1;
        return false;
      }
      const contrast = borderContrast(quad, greyPixels, colourPixels, workWidth, workHeight);
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
        score: rectangle * rectangle * symmetry * upright * quality * contrast * areaPrior(areaFraction, minAreaFraction)
      });
      return true;
    };
    for (const map of maps) {
      const contours = track(new cv.MatVector());
      const hierarchy = track(new cv.Mat());
      cv.findContours(map, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (let index2 = 0; index2 < contours.size(); index2 += 1) {
        const contour = track(contours.get(index2));
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
          rejects.f\u00FCllung += 1;
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
    onCandidates?.(merged, "nach \xDCberlappung");
    return merged.slice(0, maxCards);
  });
}
async function rectifyCardIn(pixels2, quad, rotation = 0) {
  const cv = await loadOpenCv();
  const quadWidth = (distance(quad.topLeft, quad.topRight) + distance(quad.bottomLeft, quad.bottomRight)) / 2;
  const reduction = Math.max(1, Math.floor(quadWidth / RECTIFIED_WIDTH));
  const scaled = scaleQuad(quad, 1 / reduction);
  const cycle = [scaled.topLeft, scaled.topRight, scaled.bottomRight, scaled.bottomLeft];
  const turn = (rotation % 4 + 4) % 4;
  const corners = [0, 1, 2, 3].map((offset) => cycle[(offset + turn) % 4]);
  return withMats((track) => {
    const full = track(cv.matFromImageData(pixels2));
    let source = full;
    if (reduction > 1) {
      const reduced = track(new cv.Mat());
      const size = new cv.Size(
        Math.max(2, Math.round(pixels2.width / reduction)),
        Math.max(2, Math.round(pixels2.height / reduction))
      );
      cv.resize(full, reduced, size, 0, 0, cv.INTER_AREA);
      source = reduced;
    }
    const from = track(
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        corners.flatMap((point) => [point.x, point.y])
      )
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
        RECTIFIED_HEIGHT
      ])
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
      new cv.Scalar()
    );
    return {
      data: new Uint8ClampedArray(warped.data),
      width: RECTIFIED_WIDTH,
      height: RECTIFIED_HEIGHT
    };
  });
}

// src/scanner/live-pipeline.ts
var VARIANTS = [
  { inset: 0.04, rotation: 0 },
  { inset: 0, rotation: 0 },
  { inset: 0.04, rotation: 2 },
  { inset: 0, rotation: 2 }
];
var GUIDE_HEIGHT_FRACTION = 0.62;
var GUIDE_MARGIN = 1.25;
var LIVE_SHORTLIST = 6;
var AGREEMENT_HITS = 2;
var EXPLORE_EVERY = 3;
var AGREEMENT_WINDOW = 4;
function guideRegion(width2, height) {
  const guideHeight = height * GUIDE_HEIGHT_FRACTION;
  const guideWidth = guideHeight * (63 / 88);
  const searchHeight = Math.min(height, guideHeight * GUIDE_MARGIN);
  const searchWidth = Math.min(width2, guideWidth * GUIDE_MARGIN);
  return {
    x: Math.round((width2 - searchWidth) / 2),
    y: Math.round((height - searchHeight) / 2),
    width: Math.round(searchWidth),
    height: Math.round(searchHeight)
  };
}
function cutRegion(pixels2, region) {
  const data2 = new Uint8ClampedArray(region.width * region.height * 4);
  for (let row = 0; row < region.height; row += 1) {
    const from = ((region.y + row) * pixels2.width + region.x) * 4;
    data2.set(pixels2.data.subarray(from, from + region.width * 4), row * region.width * 4);
  }
  return { data: data2, width: region.width, height: region.height };
}
function offsetQuad(quad, region) {
  const move = (point) => ({ x: point.x + region.x, y: point.y + region.y });
  return {
    topLeft: move(quad.topLeft),
    topRight: move(quad.topRight),
    bottomRight: move(quad.bottomRight),
    bottomLeft: move(quad.bottomLeft)
  };
}
async function previewFrame(pixels2, index2, embedder2, variantIndex) {
  const started = performance.now();
  const timings = { detect: 0, embed: 0, search: 0 };
  const region = guideRegion(pixels2.width, pixels2.height);
  const searched = cutRegion(pixels2, region);
  const detected = await detectCardsIn(searched, { maxCards: 1 });
  timings.detect = performance.now() - started;
  if (detected.length === 0) {
    return {
      candidates: [],
      crops: [],
      quad: null,
      areaFraction: 0,
      region,
      milliseconds: performance.now() - started,
      timings
    };
  }
  const card = detected[0];
  const variant = VARIANTS[variantIndex % VARIANTS.length];
  const quad = variant.inset === 0 ? card.quad : shrinkQuad(card.quad, variant.inset);
  const crop = await rectifyCardIn(searched, quad, variant.rotation);
  const embedStarted = performance.now();
  const vector = await embedder2.embed(crop);
  timings.embed = performance.now() - embedStarted;
  const searchStarted = performance.now();
  const candidates = index2.search(index2.project(vector), LIVE_SHORTLIST);
  timings.search = performance.now() - searchStarted;
  return {
    candidates,
    crops: [crop],
    quad: offsetQuad(card.quad, region),
    areaFraction: card.areaFraction,
    region,
    milliseconds: performance.now() - started,
    timings
  };
}
function createVariantSelector() {
  const recent = new Float32Array(VARIANTS.length).fill(-1);
  let frame = -1;
  let explored = -1;
  return {
    /**
     * Picks the variant for the next frame
     *
     * @returns an index into the variant list
     */
    next() {
      frame += 1;
      if (frame % EXPLORE_EVERY !== 0) {
        let best = 0;
        for (let variant = 1; variant < VARIANTS.length; variant += 1) {
          if (recent[variant] > recent[best]) best = variant;
        }
        if (recent[best] >= 0) return best;
      }
      explored += 1;
      return explored % VARIANTS.length;
    },
    /**
     * Records how well a variant did, so the next choice can follow it
     *
     * @param variant
     * @param score
     */
    record(variant, score) {
      recent[variant % VARIANTS.length] = score;
    },
    /**
     * Forgets what it learned, for when the card changes
     */
    reset() {
      recent.fill(-1);
      frame = -1;
      explored = -1;
    }
  };
}
function createAgreementTracker() {
  let window = [];
  return {
    /**
     * Records this frame's leader and reports whether the window agrees
     *
     * @param id
     * @param score
     * @returns whether it recurs and no rival in the window scored better
     */
    seen(id, score) {
      window.push({ id, score });
      if (window.length > AGREEMENT_WINDOW) window.shift();
      if (id === null) return false;
      let hits = 0;
      let rival = -Infinity;
      for (const entry of window) {
        if (entry.id === id) hits += 1;
        else if (entry.id !== null) rival = Math.max(rival, entry.score);
      }
      return hits >= AGREEMENT_HITS && score >= rival;
    },
    /**
     * Forgets the window
     */
    reset() {
      window = [];
    }
  };
}

// test/live-timing.ts
var here = dirname(fileURLToPath(import.meta.url));
var indexDir = join(here, "..", "public", "data", "scan-index");
function option(flag, fallback) {
  const index2 = process.argv.indexOf(flag);
  return index2 === -1 ? fallback : process.argv[index2 + 1];
}
var photo = process.argv[2];
if (!photo) throw new Error("Aufruf: live-timing.mjs <foto> [--frames 12] [--width 1080]");
var frameCount = Number(option("--frames", "12"));
var width = Number(option("--width", "1080"));
var manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
var index = createEmbeddingIndex({
  manifest,
  projection: (await readFile(join(indexDir, "projection.f32"))).buffer,
  vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer,
  cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8"))
});
var session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
  intraOpNumThreads: 4
});
var inputName = session.inputNames[0];
var outputName = session.outputNames[0];
var embedder = {
  backend: "wasm",
  notes: [],
  async embed(image) {
    const output = await session.run({
      [inputName]: new ort.Tensor("float32", await prepareForModel(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE])
    });
    const tensor = output[outputName];
    return poolHidden(tensor.data, 1, tensor.dims[1])[0];
  }
};
var { data, info } = await sharp(photo).rotate().resize({ width }).ensureAlpha().raw().toBuffer({
  resolveWithObject: true
});
var pixels = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
var agrees = createAgreementTracker();
var variants = createVariantSelector();
var confirmedAt = -1;
var total = 0;
process.stdout.write(`Bild ${info.width}x${info.height}
`);
for (let frame = 0; frame < frameCount; frame += 1) {
  const started = Date.now();
  const variant = variants.next();
  const preview = await previewFrame(pixels, index, embedder, variant);
  variants.record(variant, preview.candidates[0]?.score ?? 0);
  const elapsed = Date.now() - started;
  total += elapsed;
  const top = preview?.candidates[0];
  const agreed = agrees.seen(top ? top.printing.id : null, top?.score ?? 0);
  if (agreed && confirmedAt < 0) confirmedAt = frame;
  process.stdout.write(
    `  Frame ${String(frame).padStart(2)}  V${variant}  ${String(elapsed).padStart(5)} ms  ${(top?.printing.name ?? "-").slice(0, 28).padEnd(28)} ${top ? top.score.toFixed(3) : "     "}  ${agreed ? "EINIG" : ""}
`
  );
}
process.stdout.write(
  `
${(total / frameCount).toFixed(0)} ms pro Frame im Mittel
` + (confirmedAt < 0 ? `in ${frameCount} Frames keine Einigkeit
` : `Einigkeit ab Frame ${confirmedAt}, also nach rund ${(total / frameCount * (confirmedAt + 1)).toFixed(0)} ms
`)
);
//! Lazy loader for the OpenCV.js runtime.
//!
//! The runtime is one 13 MB module (3.7 MB gzipped, WASM embedded), so it is imported
//! dynamically and only when a scan actually starts. `loadOpenCv` dedupes concurrent callers
//! and caches the resolved namespace, which makes it safe to call on every frame.
//! Judges whether a rectified card is worth recognising at all, and evens out what glare did.
//! A scan can fail for two very different reasons, and telling them apart matters because only
//! one of them is the scanner's fault. Either detection cropped the wrong rectangle, which is
//! fixable, or the photo itself is out of focus, which is not: no matching stage recovers detail
//! that was never captured. The live scanner needs the second case as its own answer, so it can
//! ask for a steadier shot instead of guessing.
//! Shared preprocessing and pooling for the card embedding.
//! The reference index and a live scan must go through byte-identical arithmetic, otherwise the
//! query lands in a slightly different space than the vectors it is compared against and the
//! nearest neighbour stops being the right card. Both sides therefore call the functions here;
//! only the inference backend differs (onnxruntime-node when building the index,
//! onnxruntime-web in the app).
//! Nearest-neighbour search over the packed reference index.
//! The index is a flat int8 matrix, searched exhaustively. That is a deliberate choice over an
//! approximate structure: 111k rows of 128 int8 is 14 MB and one query is 14 million multiply
//! adds, which a typed-array loop does in a few milliseconds. An ANN index would save little,
//! cost recall, and add a build step whose correctness is much harder to verify.
//! The index is also the scanner's card detector of last resort. A quad that rectified into a
//! piece of playmat has no near neighbour here, so a low best score is the signal that the
//! detection was wrong, not that the card is unknown.
//! Builds card quads from straight line segments instead of from closed contours.
//! Contour detection needs the card's outline to close. On the photos that matter it often does
//! not: a card lying on a stack has its bottom edge swallowed by the card below, and a sleeved
//! card on a busy background can lose its outer boundary almost entirely. A line does not have
//! to close, so `houghQuads` still recovers the card from three clean edges and a fragment.
//! The decisive signal here is not the intersection geometry, which is cheap to satisfy by
//! accident, but {@link edgeSupport}: how much of each proposed side is actually covered by
//! detected segments. Four lines that merely happen to cross in a card-shaped way score near
//! zero on it.
//! Finds Magic cards in a camera frame and rectifies them into the canonical reference frame.
//! Everything downstream of this module assumes a card that has been perspective-corrected to
//! exactly the geometry of a Scryfall `normal` scan. That is what makes fixed-position crops
//! (set symbol, collector line, title bar) meaningful and what lets a camera photo and a
//! reference image be compared at all.
//! The 180° ambiguity is deliberately not resolved here: a card photographed upside down
//! produces a valid quad whose "top" edge is the bottom of the card. `rectifyCard` therefore
//! takes the orientation as a parameter and the matching stage scores both.
//! The functions taking an {@link RgbaImage} are the real implementation and are free of DOM
//! types, which is what lets the Node harness in test/ exercise the same code the app runs.
//! Verifies a candidate printing by matching local features against its reference image.
//! A global embedding answers "which card is this most like", which is the right question for
//! narrowing 111k printings down to a handful and the wrong one for deciding between them. Two
//! printings sharing an illustration differ in a set symbol and a line of small type, and a
//! single vector cannot carry that. Local features can: a correct pair produces hundreds of
//! keypoint correspondences that all agree on one homography, a wrong pair produces a scatter
//! that agrees on nothing.
//! Descriptors are handed around as plain typed arrays rather than as OpenCV Mats. Mats live in
//! the WASM heap and have to be freed by hand, which makes them unfit for anything that is kept
//! between calls, and the typed arrays are also exactly what a precomputed index would store.
//! Fetches the reference image of a printing so its local features can be compared.
//! The descriptors themselves cannot be shipped: 111k printings at five hundred keypoints of
//! thirty-two bytes is close to two gigabytes. The images can be fetched instead, and only for
//! the handful of candidates a scan actually shortlists. They come from the same CDN the
//! collection already loads artwork from, so most of them are in the service worker's cache
//! before the scanner ever asks.
//! The url follows from the Scryfall id, which the index already stores, so no second lookup and
//! no extra megabytes in the index.
//! Turns verified candidates into an answer, or into an honest refusal.
//! A scanner that always names a card is worse than one that sometimes says nothing: a wrong
//! card enters the collection silently and is found weeks later, while "not recognised" costs
//! one more second of holding the card still. The inlier count separates the two cases so
//! cleanly that the choice barely costs anything.
//! Measured over 113 photos across three backgrounds: every correct answer had at least 30
//! inliers, every wrong one at most 14, and the range between was empty. The mechanism behind
//! that gap is not a coincidence of this data, it is what the count means. Two pictures of the
//! same card agree in hundreds of places at once and all of those agreements fit one homography;
//! two different cards agree in a handful of places that fit nothing.
//! The recognition chain, split for live use.
//! A single-shot scan may spend seconds on one picture. A live scanner may not: it sees four to
//! ten frames a second and has to stay responsive between them. What makes that possible is that
//! the two halves of the chain cost wildly different amounts. Detection, embedding and the index
//! search are local and quick. Verification loads reference images over the network and compares
//! descriptors, and it is the only part that can say for certain which printing this is.
//! So verification does not run per frame. It runs when the cheap half has said the same thing
//! twice, which is both a good sign that the card is being held still and the point at which the
//! answer is worth confirming. Everything it loads is cached, so the second look at a candidate
//! costs nothing.
//! Times the live chain the way it actually runs: one variant per frame, until it would confirm.
//! Per-frame milliseconds are not what a user waits for. What they wait for is the number of
//! frames the design needs before it will confirm, multiplied by what a frame costs on their
//! device. This walks the real `previewFrame` over a photo, frame by frame, and reports both.
//! Usage: node test/live-timing.mjs <photo> [--frames 12] [--width 1080]
