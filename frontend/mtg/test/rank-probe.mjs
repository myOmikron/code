// test/rank-probe.ts
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
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
    const matches2 = [];
    for (let rank2 = 0; rank2 < limit; rank2 += 1) {
      const row = bestRows[rank2];
      if (row < 0) break;
      const card = cards[row];
      matches2.push({
        score: bestScores[rank2] / divisor,
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
    return matches2;
  };
  return { manifest: manifest2, project, search };
}

// test/rank-probe.ts
var here = dirname(fileURLToPath(import.meta.url));
var indexDir = join(here, "..", "public", "data", "scan-index");
var [cropPath, wantedSet] = process.argv.slice(2);
var manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
var index = createEmbeddingIndex({
  manifest,
  projection: (await readFile(join(indexDir, "projection.f32"))).buffer,
  vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer,
  cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8"))
});
var session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
  intraOpNumThreads: 12
});
async function read(path) {
  const { data, info } = await sharp(path).resize(488, 680, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
async function embed(image) {
  const output = await session.run({
    [session.inputNames[0]]: new ort.Tensor("float32", preprocess(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE])
  });
  const tensor = output[session.outputNames[0]];
  return poolHidden(tensor.data, 1, tensor.dims[1])[0];
}
var matches = index.search(index.project(await embed(await read(cropPath))), 3e3);
console.log("Beste Treffer:");
for (const match of matches.slice(0, 8)) {
  console.log(`  ${match.score.toFixed(4)}  ${match.printing.name.slice(0, 34).padEnd(36)} ${match.printing.set} ${match.printing.collectorNumber}`);
}
var rank = matches.findIndex((match) => match.printing.set === wantedSet);
console.log(
  rank === -1 ? `
${wantedSet} nicht unter den ersten ${matches.length}` : `
${wantedSet} auf Rang ${rank + 1} mit ${matches[rank].score.toFixed(4)}: ${matches[rank].printing.name} ${matches[rank].printing.collectorNumber}`
);
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
//! Reports where a known printing ranks for a given crop, and what beat it.
//! "The scanner said the wrong card" leaves the important question open: was the right one close
//! behind, or nowhere at all. The first is a ranking problem, the second means the crop and the
//! reference have nothing in common, and the two call for entirely different work.
