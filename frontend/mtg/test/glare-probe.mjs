// test/glare-probe.ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";

// src/scanner/embedding.ts
var IMAGE_SIZE = 224;
var HIDDEN_DIM = 384;
var EMBEDDING_DIM = HIDDEN_DIM * 2;
var MEAN = [0.485, 0.456, 0.406];
var STD = [0.229, 0.224, 0.225];
function preprocess(image) {
  const { data, width, height } = image;
  const pixels = IMAGE_SIZE * IMAGE_SIZE;
  const output = new Float32Array(3 * pixels);
  for (let y = 0; y < IMAGE_SIZE; y += 1) {
    const fromY = Math.floor(y * height / IMAGE_SIZE);
    const toY = Math.max(fromY + 1, Math.floor((y + 1) * height / IMAGE_SIZE));
    for (let x = 0; x < IMAGE_SIZE; x += 1) {
      const fromX = Math.floor(x * width / IMAGE_SIZE);
      const toX = Math.max(fromX + 1, Math.floor((x + 1) * width / IMAGE_SIZE));
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sourceY = fromY; sourceY < toY; sourceY += 1) {
        let offset = (sourceY * width + fromX) * 4;
        for (let sourceX = fromX; sourceX < toX; sourceX += 1) {
          red += data[offset];
          green += data[offset + 1];
          blue += data[offset + 2];
          offset += 4;
        }
      }
      const area = (toY - fromY) * (toX - fromX);
      const target2 = y * IMAGE_SIZE + x;
      output[target2] = (red / area / 255 - MEAN[0]) / STD[0];
      output[pixels + target2] = (green / area / 255 - MEAN[1]) / STD[1];
      output[2 * pixels + target2] = (blue / area / 255 - MEAN[2]) / STD[2];
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

// test/glare-probe.ts
var here = dirname(fileURLToPath(import.meta.url));
var cacheDir = join(here, "..", ".cache", "scryfall");
var [cropPath] = process.argv.slice(2);
var cv = await loadOpenCv();
var session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
  intraOpNumThreads: 12
});
async function read(path) {
  const { data, info } = await sharp(path).resize(488, 680, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
function equalise(image, clip) {
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
    const out = track(new cv.Mat());
    cv.cvtColor(lab, out, cv.COLOR_Lab2RGB);
    const rgbaOut = track(new cv.Mat());
    cv.cvtColor(out, rgbaOut, cv.COLOR_RGB2RGBA);
    return { data: new Uint8ClampedArray(rgbaOut.data), width: image.width, height: image.height };
  });
}
async function embed(image) {
  const output = await session.run({
    [session.inputNames[0]]: new ort.Tensor("float32", preprocess(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE])
  });
  const tensor = output[session.outputNames[0]];
  return poolHidden(tensor.data, 1, tensor.dims[1])[0];
}
var dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
var faces = [];
var lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
for await (const line of lines) if (line) faces.push(JSON.parse(line));
var target = faces.find((f) => f.set === "hob" && f.collectorNumber === "170");
var distractor = faces.find((f) => f.set === "unk" && f.collectorNumber === "RZ05a");
var crop = await read(cropPath);
var reference = await read(join(cacheDir, target.image));
var wrong = await read(join(cacheDir, distractor.image));
for (const clip of [0, 2, 3, 4]) {
  const apply = (image) => clip === 0 ? image : equalise(image, clip);
  const q = await embed(apply(crop));
  const r = await embed(apply(reference));
  const w = await embed(apply(wrong));
  console.log(
    `clip ${clip === 0 ? "aus " : String(clip).padEnd(4)}  richtig ${dot(q, r).toFixed(4)}   falsch ${dot(q, w).toFixed(4)}   Abstand ${(dot(q, r) - dot(q, w)).toFixed(4)}`
  );
}
//! Shared preprocessing and pooling for the card embedding.
//!
//! The reference index and a live scan must go through byte-identical arithmetic, otherwise the
//! query lands in a slightly different space than the vectors it is compared against and the
//! nearest neighbour stops being the right card. Both sides therefore call the functions here;
//! only the inference backend differs (onnxruntime-node when building the index,
//! onnxruntime-web in the app).
//! Lazy loader for the OpenCV.js runtime.
//! The runtime is one 13 MB module (3.7 MB gzipped, WASM embedded), so it is imported
//! dynamically and only when a scan actually starts. `loadOpenCv` dedupes concurrent callers
//! and caches the resolved namespace, which makes it safe to call on every frame.
//! Tests whether local contrast equalisation closes the gap that glare opens.
//! A reflection across a card flattens it: the model then sees something closer to any other
//! washed-out picture than to the card's own reference scan. CLAHE restores local contrast
//! without amplifying the reflection itself, which is what plain histogram equalisation would do.
