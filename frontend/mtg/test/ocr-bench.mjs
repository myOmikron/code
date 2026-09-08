// test/ocr-bench.ts
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

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
    const data = lines.data32S;
    const count = Math.floor(data.length / 4);
    for (let index2 = 0; index2 < count; index2 += 1) {
      const a = { x: data[index2 * 4], y: data[index2 * 4 + 1] };
      const b = { x: data[index2 * 4 + 2], y: data[index2 * 4 + 3] };
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
  const { top, bottom, left, right: right2 } = sideLengths(quad);
  const width2 = (top + bottom) / 2;
  const height = (left + right2) / 2;
  if (height < 1) return 0;
  return Math.max(0, 1 - Math.abs(width2 / height - CARD_ASPECT) / ASPECT_TOLERANCE);
}
function symmetryScore(quad) {
  const { top, bottom, left, right: right2 } = sideLengths(quad);
  const horizontal = Math.min(top, bottom) / Math.max(top, bottom, 1e-6);
  const vertical = Math.min(left, right2) / Math.max(left, right2, 1e-6);
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
      const data = approx.data32S;
      return [0, 1, 2, 3].map((index2) => ({ x: data[index2 * 2], y: data[index2 * 2 + 1] }));
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
async function detectCardsIn(pixels, options = {}) {
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
async function rectifyCardIn(pixels, quad, rotation = 0, scale = 1) {
  const cv = await loadOpenCv();
  const targetWidth = Math.round(RECTIFIED_WIDTH * scale);
  const targetHeight = Math.round(RECTIFIED_HEIGHT * scale);
  const quadWidth = (distance(quad.topLeft, quad.topRight) + distance(quad.bottomLeft, quad.bottomRight)) / 2;
  const reduction = Math.max(1, Math.floor(quadWidth / targetWidth));
  const scaled = scaleQuad(quad, 1 / reduction);
  const cycle = [scaled.topLeft, scaled.topRight, scaled.bottomRight, scaled.bottomLeft];
  const turn = (rotation % 4 + 4) % 4;
  const corners = [0, 1, 2, 3].map((offset) => cycle[(offset + turn) % 4]);
  return withMats((track) => {
    const full = track(cv.matFromImageData(pixels));
    let source = full;
    if (reduction > 1) {
      const reduced = track(new cv.Mat());
      const size = new cv.Size(
        Math.max(2, Math.round(pixels.width / reduction)),
        Math.max(2, Math.round(pixels.height / reduction))
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
      cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, targetWidth, 0, targetWidth, targetHeight, 0, targetHeight])
    );
    const transform = track(cv.getPerspectiveTransform(from, to));
    const warped = track(new cv.Mat());
    cv.warpPerspective(
      source,
      warped,
      transform,
      new cv.Size(targetWidth, targetHeight),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
      new cv.Scalar()
    );
    return { data: new Uint8ClampedArray(warped.data), width: targetWidth, height: targetHeight };
  });
}

// src/scanner/embedding.ts
var PREPROCESSING = "area224";
var HIDDEN_DIM = 384;
var EMBEDDING_DIM = HIDDEN_DIM * 2;

// src/scanner/embedding-index.ts
var MIN_MATCH_LENGTH = 8;
var MIN_FUZZY_LENGTH = 4;
function editDistance(a, b, bound) {
  if (Math.abs(a.length - b.length) > bound) return bound + 1;
  let previous = new Uint16Array(b.length + 1);
  let current = new Uint16Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let best = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (current[j] < best) best = current[j];
    }
    if (best > bound) return bound + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length];
}
function nameKey(name) {
  return name.split("//")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
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
  const rowsByName = /* @__PURE__ */ new Map();
  for (let row = 0; row < count; row += 1) {
    const key = nameKey(cards[row].n);
    const rows = rowsByName.get(key);
    if (rows) rows.push(row);
    else rowsByName.set(key, [row]);
  }
  const quantise = (query) => {
    const quantised = new Int8Array(dim);
    for (let d = 0; d < dim; d += 1) {
      quantised[d] = Math.max(-127, Math.min(127, Math.round(query[d] * scale)));
    }
    return quantised;
  };
  const describe = (row, dot) => {
    const card = cards[row];
    return {
      score: dot / (scale * scale),
      printing: {
        id: card.i,
        name: card.n,
        set: card.s,
        collectorNumber: card.c,
        lang: card.l,
        face: card.f
      }
    };
  };
  const resolveName = (text) => {
    const key = nameKey(text);
    if (!key) return "";
    if (rowsByName.has(key)) return key;
    let contained = "";
    for (const candidate of rowsByName.keys()) {
      if (key.length < MIN_MATCH_LENGTH) break;
      if (candidate.length < MIN_MATCH_LENGTH || !candidate.includes(key)) continue;
      if (contained) {
        contained = "";
        break;
      }
      contained = candidate;
    }
    if (contained) return contained;
    const tight = key.replace(/ /g, "");
    if (tight.length < MIN_FUZZY_LENGTH) return "";
    const bound = Math.max(2, Math.floor(tight.length / 4));
    let best = "";
    let bestDistance = bound + 1;
    let tied = false;
    for (const candidate of rowsByName.keys()) {
      if (!candidate) continue;
      const distance2 = editDistance(tight, candidate.replace(/ /g, ""), bound);
      if (distance2 > bound) continue;
      if (distance2 < bestDistance) {
        bestDistance = distance2;
        best = candidate;
        tied = false;
      } else if (distance2 === bestDistance) {
        tied = true;
      }
    }
    return tied ? "" : best;
  };
  const searchNamed = (query, name, limit = 8) => {
    const rows = rowsByName.get(resolveName(name));
    if (!rows) return [];
    const quantised = quantise(query);
    const scored = rows.map((row) => {
      let dot = 0;
      for (let d = 0; d < dim; d += 1) dot += quantised[d] * vectors[row * dim + d];
      return describe(row, dot);
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
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
  const countNamed = (name) => rowsByName.get(name)?.length ?? 0;
  return { manifest: manifest2, project, search, searchNamed, resolveName, countNamed };
}

// src/scanner/ocr.ts
var TITLE = { left: 0.06, right: 0.72, top: 0.035, bottom: 0.115 };
function titleStrip(card, upsideDown) {
  const left = Math.round(TITLE.left * card.width);
  const right2 = Math.round(TITLE.right * card.width);
  const top = Math.round(TITLE.top * card.height);
  const bottom = Math.round(TITLE.bottom * card.height);
  const width2 = right2 - left;
  const height = bottom - top;
  const out = {
    data: new Uint8ClampedArray(width2 * height * 4),
    width: width2,
    height
  };
  for (let y = 0; y < height; y += 1) {
    const row = top + y;
    const sourceY = upsideDown ? card.height - 1 - row : row;
    for (let x = 0; x < width2; x += 1) {
      const column = left + x;
      const sourceX = upsideDown ? card.width - 1 - column : column;
      const from = (sourceY * card.width + sourceX) * 4;
      const to = (y * width2 + x) * 4;
      const grey = (card.data[from] * 299 + card.data[from + 1] * 587 + card.data[from + 2] * 114) / 1e3;
      out.data[to] = grey;
      out.data[to + 1] = grey;
      out.data[to + 2] = grey;
      out.data[to + 3] = 255;
    }
  }
  return out;
}
var TITLE_REGION = { ...TITLE, width: RECTIFIED_WIDTH, height: RECTIFIED_HEIGHT };

// test/ocr-bench.ts
var here = dirname(fileURLToPath(import.meta.url));
var indexDir = join(here, "..", "public", "data", "scan-index");
function option(flag, fallback) {
  const index2 = process.argv.indexOf(flag);
  return index2 === -1 ? fallback : process.argv[index2 + 1];
}
var [labelFile, imagesDir] = process.argv.slice(2).filter((value) => !value.startsWith("--"));
if (!labelFile || !imagesDir) throw new Error("Aufruf: ocr-bench.mjs <labels.json> <bildOrdner>");
var width = Number(option("--width", "1080"));
var langPath = option("--lang", join(here, "..", "public", "tesseract"));
var manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
var index = createEmbeddingIndex({
  manifest,
  projection: (await readFile(join(indexDir, "projection.f32"))).buffer,
  vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer,
  cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8"))
});
var worker = await createWorker(option("--model", "mtg"), 1, {
  langPath,
  gzip: true,
  cacheMethod: "none",
  logger: () => void 0
});
await worker.setParameters({
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',-. ",
  tessedit_pageseg_mode: option("--psm", "13"),
  user_defined_dpi: option("--dpi", "300")
});
async function toPng(strip) {
  return sharp(Buffer.from(strip.data), { raw: { width: strip.width, height: strip.height, channels: 4 } }).png().toBuffer();
}
var labels = JSON.parse(
  await readFile(labelFile, "utf8")
);
async function cardBox(path) {
  const small = await sharp(path).rotate().resize({ width: 1080 }).ensureAlpha().raw().toBuffer({
    resolveWithObject: true
  });
  const meta = await sharp(path).rotate().metadata();
  const factor = (meta.width ?? 1080) / small.info.width;
  const found = await detectCardsIn(
    { data: new Uint8ClampedArray(small.data), width: small.info.width, height: small.info.height },
    { maxCards: 1, workingSize: 420 }
  );
  if (!found.length) return { left: 0, top: 0, width: meta.width ?? 1, height: meta.height ?? 1 };
  const points = [found[0].quad.topLeft, found[0].quad.topRight, found[0].quad.bottomRight, found[0].quad.bottomLeft];
  const xs = points.map((point) => point.x * factor);
  const ys = points.map((point) => point.y * factor);
  const pad = 0.12 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const left = Math.max(0, Math.round(Math.min(...xs) - pad));
  const top = Math.max(0, Math.round(Math.min(...ys) - pad));
  return {
    left,
    top,
    width: Math.min((meta.width ?? 1) - left, Math.round(Math.max(...xs) - Math.min(...xs) + 2 * pad)),
    height: Math.min((meta.height ?? 1) - top, Math.round(Math.max(...ys) - Math.min(...ys) + 2 * pad))
  };
}
var read = 0;
var known = 0;
var right = 0;
var detectMs = 0;
var ocrMs = 0;
var lookupMs = 0;
var fill = process.argv.includes("--fill");
for (const label of labels) {
  const source = sharp(join(imagesDir, label.file)).rotate();
  const framed = fill ? source.extract(await cardBox(join(imagesDir, label.file))) : source;
  const decoded = await framed.resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frame = {
    data: new Uint8ClampedArray(decoded.data),
    width: decoded.info.width,
    height: decoded.info.height
  };
  let started = Date.now();
  const cards = await detectCardsIn(frame, { maxCards: 1, workingSize: 420 });
  detectMs += Date.now() - started;
  if (cards.length === 0) {
    process.stdout.write(`  - ${label.file}  keine Detektion
`);
    continue;
  }
  const insets = process.argv.includes("--two-insets") ? [0, Number(option("--inset", "0.04"))] : [Number(option("--inset", "0.04"))];
  started = Date.now();
  let text = "";
  for (const inset of insets) {
    const quad = inset === 0 ? cards[0].quad : shrinkQuad(cards[0].quad, inset);
    const crop = await rectifyCardIn(frame, quad, 0);
    const upright = (await worker.recognize(await toPng(titleStrip(crop, false)))).data.text.replace(/\s+/g, " ").trim();
    if (!text) text = upright;
    if (index.resolveName(upright)) {
      text = upright;
      break;
    }
    const flipped = (await worker.recognize(await toPng(titleStrip(crop, true)))).data.text.replace(/\s+/g, " ").trim();
    if (index.resolveName(flipped)) {
      text = flipped;
      break;
    }
  }
  ocrMs += Date.now() - started;
  if (text) read += 1;
  started = Date.now();
  const resolved = index.resolveName(text);
  const printings = resolved ? index.searchNamed(new Float32Array(manifest.dim), resolved, 8) : [];
  lookupMs += Date.now() - started;
  const hit = resolved !== "" && resolved === nameKey(label.name);
  if (printings.length) known += 1;
  if (hit) right += 1;
  process.stdout.write(`  ${hit ? "+" : "-"} ${label.file}  "${text}"  ${printings.length} Drucke
`);
}
var n = labels.length;
process.stdout.write(
  `
${read}/${n} etwas gelesen, ${known}/${n} Name im Index, ${right}/${n} Name richtig
detect ${(detectMs / n).toFixed(0)} \xB7 ocr ${(ocrMs / n).toFixed(0)} \xB7 lookup ${(lookupMs / n).toFixed(0)} ms
`
);
await worker.terminate();
//! Lazy loader for the OpenCV.js runtime.
//!
//! The runtime is one 13 MB module (3.7 MB gzipped, WASM embedded), so it is imported
//! dynamically and only when a scan actually starts. `loadOpenCv` dedupes concurrent callers
//! and caches the resolved namespace, which makes it safe to call on every frame.
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
//! Reads the card's name off its title bar.
//! The embedding is the scanner's main sense and it has one blind spot that no tuning closes: a
//! foil under a lamp, behind a toploader. Measured on one such card, the correct printing sat at
//! rank 1224 with a cosine of 0.336 while unrelated cards scored 0.64, and neither white balance
//! nor a deeper shortlist moved it. The name, meanwhile, was perfectly legible.
//! So this is not a refinement of the visual match, it is a second, independent way of knowing
//! what the card is, and the two fail at different things. Text is unreadable when the card is
//! small or moving, which is exactly when the picture is still fine; the picture fails on glare
//! and foiling, which leaves the text alone.
//! Only the title bar is read, not the whole card. It is a single line of large type in a known
//! place, which is the one job OCR does quickly and well: 91 ms for a strip against well over a
//! second for one model run.
//! Measures the name-first path: detect, read the title, look the name up. No model at all.
//! The question this answers is whether the embedding is needed in the common case. It costs
//! about a second per frame on a phone, and if the card's own name is legible often enough, that
//! second buys nothing: the name narrows 111k printings to a handful directly, and local features
//! decide among them. What matters is how often "often enough" is, and what the cheap half costs
//! when the expensive half is left out.
//! Usage: node test/ocr-bench.mjs <labels.json> <imageDir> [--width 1080]
