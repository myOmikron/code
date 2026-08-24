// test/gate-probe.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
function houghQuads(cv, edges, width, height) {
  const longSide = Math.max(width, height);
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
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < -margin || point.y < -margin || point.x > width + margin || point.y > height + margin
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
function borderContrast(quad, grey, colour, width, height) {
  const sample = (x, y) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return null;
    return py * width + px;
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
    for (let index = 1; index <= BORDER_SAMPLES; index += 1) {
      const t = index / (BORDER_SAMPLES + 1);
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
function spansFrame(quad, width, height) {
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  return spanX > width * FRAME_SPAN_FRACTION && spanY > height * FRAME_SPAN_FRACTION;
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function quadArea(quad) {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const doubled = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % 4];
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
function orderCorners(points) {
  if (points.length !== 4) return null;
  const centre = {
    x: points.reduce((sum, point) => sum + point.x, 0) / 4,
    y: points.reduce((sum, point) => sum + point.y, 0) / 4
  };
  const cyclic = [...points].sort(
    (a, b) => Math.atan2(a.y - centre.y, a.x - centre.x) - Math.atan2(b.y - centre.y, b.x - centre.x)
  );
  const sides = cyclic.map((point, index) => distance(point, cyclic[(index + 1) % 4]));
  if (sides.some((side) => side < 1)) return null;
  const shortPair = sides[0] + sides[2] <= sides[1] + sides[3] ? 0 : 1;
  const midY = (index) => (cyclic[index % 4].y + cyclic[(index + 1) % 4].y) / 2;
  const start = midY(shortPair) <= midY(shortPair + 2) ? shortPair : shortPair + 2;
  const ordered = [0, 1, 2, 3].map((offset) => cyclic[(start + offset) % 4]);
  const signedArea = ordered.reduce((sum, point, index) => {
    const next = ordered[(index + 1) % 4];
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
function recoverAspectRatio(quad, width, height) {
  const centreX = width / 2;
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
  const assumed = (Math.hypot(width, height) * ASSUMED_FOCAL_FRACTION) ** 2;
  const focalSquared = conditioning >= AFFINE_THRESHOLD && Number.isFinite(recovered) && recovered > 0 ? recovered : assumed;
  const horizontal = (n2[0] * n2[0] + n2[1] * n2[1]) / focalSquared + n2[2] * n2[2];
  const vertical = (n3[0] * n3[0] + n3[1] * n3[1]) / focalSquared + n3[2] * n3[2];
  if (vertical <= DEGENERATE_EPSILON || horizontal <= DEGENERATE_EPSILON) return null;
  return Math.sqrt(horizontal / vertical);
}
function rectangleScore(quad, width, height) {
  const ratio = recoverAspectRatio(quad, width, height);
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
  const width = (top + bottom) / 2;
  const height = (left + right) / 2;
  if (height < 1) return 0;
  return Math.max(0, 1 - Math.abs(width / height - CARD_ASPECT) / ASPECT_TOLERANCE);
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
      const data = approx.data32S;
      return [0, 1, 2, 3].map((index) => ({ x: data[index * 2], y: data[index * 2 + 1] }));
    }
    const corners = cv.boxPoints(cv.minAreaRect(hull));
    return corners.length === 4 ? corners.map((corner) => ({ x: corner.x, y: corner.y })) : null;
  });
}
function isInside(point, quad) {
  const corners = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let positive = false;
  let negative = false;
  for (let index = 0; index < 4; index += 1) {
    const from = corners[index];
    const to = corners[(index + 1) % 4];
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
  for (let index = 0; index < cards.length; index += 1) {
    const overlapping = kept.findIndex(
      (other) => distance(centres[index], centres[other]) < Math.sqrt(Math.max(areas[index], areas[other])) * OVERLAP_REACH
    );
    if (overlapping === -1) {
      kept.push(index);
      continue;
    }
    const incumbent = kept[overlapping];
    const enclosesIncumbent = areas[index] > areas[incumbent] && areas[index] <= areas[incumbent] * MAX_ENCLOSING_GROWTH && cards[index].score >= cards[incumbent].score * MIN_ENCLOSING_SCORE_RATIO && cornersInside(cards[incumbent].quad, cards[index].quad) >= 3;
    if (enclosesIncumbent) kept[overlapping] = index;
  }
  return kept.map((index) => cards[index]);
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
      for (let index = 0; index < contours.size(); index += 1) {
        const contour = track(contours.get(index));
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

// test/gate-probe.ts
var [labelFile, imagesDir] = process.argv.slice(2);
if (!labelFile || !imagesDir) throw new Error("Aufruf: gate-probe.mjs <labels.json> <bildOrdner>");
var labels = JSON.parse(await readFile(labelFile, "utf8"));
async function readImage(path) {
  const { data, info } = await sharp(path).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
var totals = {};
var failures = 0;
for (const label of labels) {
  const pixels = await readImage(join(imagesDir, label.file));
  let counts = {};
  const cards = await detectCardsIn(pixels, { onRejects: (r) => counts = r });
  const interesting = Object.entries(counts).filter(([gate, count]) => count > 0 && gate !== "klein" && gate !== "keinQuad").sort((a, b) => b[1] - a[1]).map(([gate, count]) => `${gate} ${count}`).join("  ");
  if (cards.length === 0) {
    failures += 1;
    for (const [gate, count] of Object.entries(counts)) totals[gate] = (totals[gate] ?? 0) + count;
  }
  const mark = cards.length === 0 ? "KEINE" : `${cards.length}x ${cards[0].areaFraction.toFixed(3)}`;
  process.stdout.write(`${label.file}  ${mark.padEnd(12)} ${interesting}
`);
}
process.stdout.write(`
${failures} ohne Detektion. Tore \xFCber die Fehlschl\xE4ge:
`);
for (const [gate, count] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  process.stdout.write(`  ${gate.padEnd(18)} ${count}
`);
}
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
//! Reports which detection gate discards the quads, per photo.
//! "No detection" is an outcome, not a diagnosis. Every gate in `detectCardsIn` already counts
//! what it rejected; this prints that tally next to the ground truth so a failure can be
//! attributed to one gate instead of guessed at from the photo.
//! Usage: node test/gate-probe.mjs <labels.json> <imageDir>
