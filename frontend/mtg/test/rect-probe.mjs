// src/scanner/hough-quads.ts
var PARALLEL_TOLERANCE = 30 * Math.PI / 180;
var PERPENDICULAR_MINIMUM = 45 * Math.PI / 180;

// src/scanner/card-detect.ts
var CARD_ASPECT = 63 / 88;
var RECOVERED_TOLERANCE = 0.16;
var AFFINE_THRESHOLD = 0.02;
var ASSUMED_FOCAL_FRACTION = 1 / 1.4;
var DEGENERATE_EPSILON = 1e-7;
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

// test/rect-probe.ts
var WIDTH = 1e3;
var HEIGHT = 1e3;
function project(ratio, tiltDegrees, focal) {
  const half = { x: ratio / 2, y: 0.5 };
  const tilt = tiltDegrees * Math.PI / 180;
  const corners = [
    [-half.x, -half.y],
    [half.x, -half.y],
    [-half.x, half.y],
    [half.x, half.y]
  ].map(([x, y]) => {
    const z = 3 + y * Math.sin(tilt);
    const yy = y * Math.cos(tilt);
    return { x: WIDTH / 2 + focal * x / z, y: HEIGHT / 2 + focal * yy / z };
  });
  return { topLeft: corners[0], topRight: corners[1], bottomLeft: corners[2], bottomRight: corners[3] };
}
for (const ratio of [0.716, 1, 1.4]) {
  for (const tilt of [0, 15, 35, 55]) {
    const quad = project(ratio, tilt, 900);
    const recovered = recoverAspectRatio(quad, WIDTH, HEIGHT);
    const projected = (Math.hypot(quad.topRight.x - quad.topLeft.x, quad.topRight.y - quad.topLeft.y) + Math.hypot(quad.bottomRight.x - quad.bottomLeft.x, quad.bottomRight.y - quad.bottomLeft.y)) / (Math.hypot(quad.bottomLeft.x - quad.topLeft.x, quad.bottomLeft.y - quad.topLeft.y) + Math.hypot(quad.bottomRight.x - quad.topRight.x, quad.bottomRight.y - quad.topRight.y));
    console.log(
      `soll ${ratio.toFixed(3)}  kippung ${String(tilt).padStart(2)}\xB0  rekonstruiert ${recovered === null ? " null " : recovered.toFixed(4)}  naiv ${projected.toFixed(4)}  score ${rectangleScore(quad, WIDTH, HEIGHT).toFixed(3)}`
    );
  }
}
var skewed = {
  topLeft: { x: 300, y: 300 },
  topRight: { x: 700, y: 320 },
  bottomRight: { x: 640, y: 700 },
  bottomLeft: { x: 200, y: 900 }
};
console.log(`
schiefes Viereck: ${recoverAspectRatio(skewed, WIDTH, HEIGHT)}`);
var triangleish = {
  topLeft: { x: 400, y: 400 },
  topRight: { x: 600, y: 400 },
  bottomRight: { x: 500, y: 401 },
  bottomLeft: { x: 400, y: 700 }
};
console.log(`fast entartet:    ${recoverAspectRatio(triangleish, WIDTH, HEIGHT)}`);
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
//! Verifies the rectangle recovery against synthetic quads with known answers.
