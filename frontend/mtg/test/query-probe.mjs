// test/query-probe.ts
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
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
      const target = y * IMAGE_SIZE + x;
      output[target] = (red / area / 255 - MEAN[0]) / STD[0];
      output[pixels + target] = (green / area / 255 - MEAN[1]) / STD[1];
      output[2 * pixels + target] = (blue / area / 255 - MEAN[2]) / STD[2];
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

// src/scanner/embedding-index.ts
function createEmbeddingIndex(buffers) {
  const { manifest: manifest2, cards } = buffers;
  const { dim, count, sourceDim, scale } = manifest2;
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
      let dot2 = 0;
      for (let d = 0; d < dim; d += 1) dot2 += quantised[d] * vectors[offset + d];
      if (dot2 <= bestScores[limit - 1]) continue;
      let slot = limit - 1;
      while (slot > 0 && bestScores[slot - 1] < dot2) {
        bestScores[slot] = bestScores[slot - 1];
        bestRows[slot] = bestRows[slot - 1];
        slot -= 1;
      }
      bestScores[slot] = dot2;
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

// test/query-probe.ts
var here = dirname(fileURLToPath(import.meta.url));
var indexDir = join(here, "..", "public", "data", "scan-index");
var cacheDir = join(here, "..", ".cache", "scryfall");
var [cropPath, wantSet, wantNumber] = process.argv.slice(2);
var manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
var index = createEmbeddingIndex({
  manifest,
  projection: (await readFile(join(indexDir, "projection.f32"))).buffer,
  vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer,
  cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8"))
});
var faces = [];
var lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
for await (const line of lines) if (line) faces.push(JSON.parse(line));
var reference = faces.find(
  (face) => face.set === wantSet && face.collectorNumber.toUpperCase() === wantNumber.toUpperCase()
);
if (!reference) throw new Error("Referenz nicht gefunden");
var session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
  intraOpNumThreads: 12
});
var inputName = session.inputNames[0];
var outputName = session.outputNames[0];
async function read(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
async function embed(image) {
  const output = await session.run({
    [inputName]: new ort.Tensor("float32", preprocess(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE])
  });
  const tensor = output[outputName];
  return poolHidden(tensor.data, 1, tensor.dims[1])[0];
}
var dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
var cropImage = await read(cropPath);
var referenceImage = await read(join(cacheDir, reference.image));
console.log(`Ausschnitt ${cropImage.width}x${cropImage.height}, Referenz ${referenceImage.width}x${referenceImage.height}`);
async function inset(image, fraction) {
  const left = Math.round(image.width * fraction);
  const top = Math.round(image.height * fraction);
  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 }
  }).extract({ left, top, width: image.width - 2 * left, height: image.height - 2 * top }).resize(image.width, image.height, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
var cropRaw = await embed(cropImage);
var referenceRaw = await embed(referenceImage);
console.log(`roh 768-dim  cos(Ausschnitt, Referenz) = ${dot(cropRaw, referenceRaw).toFixed(4)}`);
var cropProjected = index.project(cropRaw);
var referenceProjected = index.project(referenceRaw);
console.log(`nach PCA 128 cos                      = ${dot(cropProjected, referenceProjected).toFixed(4)}`);
for (const fraction of [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08]) {
  const shrunk = await embed(await inset(cropImage, fraction));
  const projected = index.project(shrunk);
  const top = index.search(projected, 1)[0];
  console.log(
    `  einw\xE4rts ${(fraction * 100).toFixed(0).padStart(2)}%  roh ${dot(shrunk, referenceRaw).toFixed(4)}  pca ${dot(projected, referenceProjected).toFixed(4)}  bestes: ${top.printing.name} (${top.printing.set}) ${top.score.toFixed(3)}`
  );
}
for (const [label, vector] of [["Referenz", referenceProjected], ["Ausschnitt", cropProjected]]) {
  const top = index.search(vector, 3);
  console.log(
    `Suche mit ${label.padEnd(11)} -> ` + top.map((m) => `${m.printing.name} (${m.printing.set}) ${m.score.toFixed(3)}`).join("  |  ")
  );
}
//! Shared preprocessing and pooling for the card embedding.
//!
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
//! Compares one photo's rectified crop with the reference image of the card it shows.
//! Isolates where similarity is lost: in the model, or in the projection to the index space.
