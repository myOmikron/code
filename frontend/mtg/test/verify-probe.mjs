// test/verify-probe.ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

// src/scanner/feature-verify.ts
var DESCRIPTOR_BYTES = 32;
var RATIO_TEST = 0.78;
var RANSAC_THRESHOLD = 4;
var MIN_MATCHES = 8;
async function describeCard(image, maxFeatures = 500) {
  const cv = await loadOpenCv();
  return withMats((track) => {
    const rgba = track(cv.matFromImageData(image));
    const grey = track(new cv.Mat());
    cv.cvtColor(rgba, grey, cv.COLOR_RGBA2GRAY);
    const orb = track(new cv.ORB(maxFeatures));
    const keypoints = track(new cv.KeyPointVector());
    const descriptors = track(new cv.Mat());
    const mask = track(new cv.Mat());
    orb.detectAndCompute(grey, mask, keypoints, descriptors, false);
    const count = keypoints.size();
    const points = new Float32Array(count * 2);
    for (let index = 0; index < count; index += 1) {
      const point = keypoints.get(index).pt;
      points[index * 2] = point.x;
      points[index * 2 + 1] = point.y;
    }
    return {
      descriptors: new Uint8Array(descriptors.data.slice(0, count * DESCRIPTOR_BYTES)),
      points,
      count
    };
  });
}
async function verifyAgainst(query2, reference) {
  const empty = { matches: 0, inliers: 0, ratio: 0 };
  if (query2.count < MIN_MATCHES || reference.count < MIN_MATCHES) return empty;
  const cv = await loadOpenCv();
  return withMats((track) => {
    const queryDescriptors = track(cv.matFromArray(query2.count, DESCRIPTOR_BYTES, cv.CV_8U, [...query2.descriptors]));
    const referenceDescriptors = track(
      cv.matFromArray(reference.count, DESCRIPTOR_BYTES, cv.CV_8U, [...reference.descriptors])
    );
    const matcher = track(new cv.BFMatcher(cv.NORM_HAMMING, false));
    const knn = track(new cv.DMatchVectorVector());
    matcher.knnMatch(queryDescriptors, referenceDescriptors, knn, 2);
    const from = [];
    const to = [];
    for (let index = 0; index < knn.size(); index += 1) {
      const pair = knn.get(index);
      if (pair.size() < 2) continue;
      const best = pair.get(0);
      const second = pair.get(1);
      if (best.distance >= RATIO_TEST * second.distance) continue;
      from.push(query2.points[best.queryIdx * 2], query2.points[best.queryIdx * 2 + 1]);
      to.push(reference.points[best.trainIdx * 2], reference.points[best.trainIdx * 2 + 1]);
    }
    const matches = from.length / 2;
    if (matches < MIN_MATCHES) return { matches, inliers: 0, ratio: 0 };
    const source = track(cv.matFromArray(matches, 1, cv.CV_32FC2, from));
    const target2 = track(cv.matFromArray(matches, 1, cv.CV_32FC2, to));
    const inlierMask = track(new cv.Mat());
    const homography = track(cv.findHomography(source, target2, cv.RANSAC, RANSAC_THRESHOLD, inlierMask));
    if (homography.empty()) return { matches, inliers: 0, ratio: 0 };
    let inliers = 0;
    for (let index = 0; index < inlierMask.rows; index += 1) if (inlierMask.data[index]) inliers += 1;
    return { matches, inliers, ratio: inliers / Math.min(query2.count, reference.count) };
  });
}

// test/verify-probe.ts
var here = dirname(fileURLToPath(import.meta.url));
var cacheDir = join(here, "..", ".cache", "scryfall");
var [cropPath, wantSet, wantNumber] = process.argv.slice(2);
async function read(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
var faces = [];
var lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
for await (const line of lines) if (line) faces.push(JSON.parse(line));
var target = faces.find((f) => f.set === wantSet && f.collectorNumber.toUpperCase() === wantNumber.toUpperCase());
var sameName = faces.filter((f) => f.name === target.name && f !== target).slice(0, 4);
var others = [0, 2e4, 45e3, 7e4, 95e3].map((i) => faces[i]);
var query = await describeCard(await read(cropPath));
console.log(`Anfrage: ${query.count} Keypoints
`);
for (const [label, face] of [
  ["RICHTIG   ", target],
  ...sameName.map((f) => ["Reprint   ", f]),
  ...others.map((f) => ["fremd     ", f])
]) {
  const reference = await describeCard(await read(join(cacheDir, face.image)));
  const result = await verifyAgainst(query, reference);
  console.log(
    `${label} ${face.name.slice(0, 24).padEnd(25)} (${face.set.toUpperCase().padEnd(4)}) ${face.collectorNumber.padEnd(8)} kp ${String(reference.count).padStart(3)}  matches ${String(result.matches).padStart(3)}  inliers ${String(result.inliers).padStart(3)}  ratio ${result.ratio.toFixed(3)}`
  );
}
//! Lazy loader for the OpenCV.js runtime.
//!
//! The runtime is one 13 MB module (3.7 MB gzipped, WASM embedded), so it is imported
//! dynamically and only when a scan actually starts. `loadOpenCv` dedupes concurrent callers
//! and caches the resolved namespace, which makes it safe to call on every frame.
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
//! Checks whether local features separate the right printing from wrong ones at all.
