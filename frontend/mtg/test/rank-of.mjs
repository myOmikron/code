// test/rank-of.ts
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
async function equaliseLocalContrast(image2, clip = 4) {
  const cv = await loadOpenCv();
  return withMats((track) => {
    const rgba = track(cv.matFromImageData(image2));
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
    return { data: new Uint8ClampedArray(out.data), width: image2.width, height: image2.height };
  });
}

// src/scanner/embedding.ts
var PREPROCESSING = "area224";
var IMAGE_SIZE = 224;
var HIDDEN_DIM = 384;
var EMBEDDING_DIM = HIDDEN_DIM * 2;
var MEAN = [0.485, 0.456, 0.406];
var STD = [0.229, 0.224, 0.225];
function preprocess(image2) {
  const { data: data2, width, height } = image2;
  const pixels = IMAGE_SIZE * IMAGE_SIZE;
  const output2 = new Float32Array(3 * pixels);
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
          red += data2[offset];
          green += data2[offset + 1];
          blue += data2[offset + 2];
          offset += 4;
        }
      }
      const area = (toY - fromY) * (toX - fromX);
      const target = y * IMAGE_SIZE + x;
      output2[target] = (red / area / 255 - MEAN[0]) / STD[0];
      output2[pixels + target] = (green / area / 255 - MEAN[1]) / STD[1];
      output2[2 * pixels + target] = (blue / area / 255 - MEAN[2]) / STD[2];
    }
  }
  return output2;
}
function poolHidden(hidden, count, tokens) {
  const vectors = [];
  for (let item = 0; item < count; item += 1) {
    const base = item * tokens * HIDDEN_DIM;
    const vector2 = new Float32Array(EMBEDDING_DIM);
    let clsNorm = 0;
    for (let d = 0; d < HIDDEN_DIM; d += 1) {
      const value = hidden[base + d];
      vector2[d] = value;
      clsNorm += value * value;
    }
    clsNorm = Math.sqrt(clsNorm) || 1;
    for (let d = 0; d < HIDDEN_DIM; d += 1) vector2[d] /= clsNorm;
    let patchNorm = 0;
    for (let d = 0; d < HIDDEN_DIM; d += 1) {
      let sum = 0;
      for (let token = 1; token < tokens; token += 1) sum += hidden[base + token * HIDDEN_DIM + d];
      const value = sum / (tokens - 1);
      vector2[HIDDEN_DIM + d] = value;
      patchNorm += value * value;
    }
    patchNorm = Math.sqrt(patchNorm) || 1;
    for (let d = 0; d < HIDDEN_DIM; d += 1) vector2[HIDDEN_DIM + d] /= patchNorm;
    let norm = 0;
    for (let d = 0; d < EMBEDDING_DIM; d += 1) norm += vector2[d] * vector2[d];
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < EMBEDDING_DIM; d += 1) vector2[d] /= norm;
    vectors.push(vector2);
  }
  return vectors;
}
async function prepareForModel(image2, variant = PREPROCESSING) {
  return preprocess(variant === "clahe4+area224" ? await equaliseLocalContrast(image2) : image2);
}

// src/scanner/embedding-index.ts
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
    const output2 = new Float32Array(dim);
    let norm = 0;
    for (let component = 0; component < dim; component += 1) {
      const offset = (component + 1) * sourceDim;
      let sum = 0;
      for (let d = 0; d < sourceDim; d += 1) sum += centred[d] * projection[offset + d];
      output2[component] = sum;
      norm += sum * sum;
    }
    norm = Math.sqrt(norm) || 1;
    for (let component = 0; component < dim; component += 1) output2[component] /= norm;
    return output2;
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
  const searchNamed = (query, name, limit = 8) => {
    const rows = rowsByName.get(nameKey(name));
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
  return { manifest: manifest2, project, search, searchNamed };
}

// test/rank-of.ts
var here = dirname(fileURLToPath(import.meta.url));
var indexDir = join(here, "..", "public", "data", "scan-index");
var [cropPath, wantedSet, wantedNumber] = process.argv.slice(2);
if (!cropPath || !wantedSet || !wantedNumber) {
  throw new Error("Aufruf: rank-of.mjs <ausschnitt> <set> <sammlernummer>");
}
var manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
var index = createEmbeddingIndex({
  manifest,
  projection: (await readFile(join(indexDir, "projection.f32"))).buffer,
  vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer,
  cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8"))
});
var session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
  intraOpNumThreads: 8
});
var { data, info } = await sharp(cropPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
var image = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
var output = await session.run({
  [session.inputNames[0]]: new ort.Tensor("float32", await prepareForModel(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE])
});
var tensor = output[session.outputNames[0]];
var vector = poolHidden(tensor.data, 1, tensor.dims[1])[0];
var projected = index.project(vector);
var matches = index.search(projected, 2e3);
var named = process.argv[5];
if (named) {
  process.stdout.write(`Auf den Namen "${named}" eingeschr\xE4nkt:
`);
  for (const [position, match] of index.searchNamed(projected, named, 10).entries()) {
    process.stdout.write(
      `  ${String(position).padStart(4)}  ${match.score.toFixed(4)}  ${match.printing.set.toUpperCase()} ${match.printing.collectorNumber}
`
    );
  }
  process.stdout.write("\n");
}
var rank = matches.findIndex(
  (match) => match.printing.set.toLowerCase() === wantedSet.toLowerCase() && match.printing.collectorNumber.toLowerCase() === wantedNumber.toLowerCase()
);
process.stdout.write("Beste zehn:\n");
for (const [position, match] of matches.slice(0, 10).entries()) {
  process.stdout.write(
    `  ${String(position).padStart(4)}  ${match.score.toFixed(4)}  ${match.printing.name.slice(0, 34).padEnd(34)} ${match.printing.set.toUpperCase()} ${match.printing.collectorNumber}
`
  );
}
if (rank < 0) {
  process.stdout.write(`
${wantedSet.toUpperCase()} ${wantedNumber} nicht unter den besten ${matches.length}
`);
} else {
  process.stdout.write(
    `
${wantedSet.toUpperCase()} ${wantedNumber} auf Platz ${rank} mit ${matches[rank].score.toFixed(4)}
`
  );
}
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
//! Reports where a known printing lands in the index for a given crop.
//! "The scanner says the wrong card" has two very different causes: the right card sits just
//! below the wrong one, in which case a deeper shortlist and verification fix it, or it is
//! hundreds of rows down, in which case the embedding has failed and no amount of shortlist
//! depth will help. Only the rank tells them apart.
//! Usage: node test/rank-of.mjs <cropImage> <set> <collectorNumber>
