//! Compares a second model file against the one the index was built with.
//!
//! A cheaper model is only worth having if its vectors still land in the same space as the
//! index's. Cosine agreement between the two embeddings answers that directly, and retrieval on
//! real reference images answers whether any drift actually costs a hit. Speed without that check
//! is meaningless: a faster model that quietly moves the query is a worse scanner.
//!
//! Usage: node test/model-compare.mjs <otherModel> [--count 40]
import { gunzipSync } from "node:zlib";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { IMAGE_SIZE, poolHidden, prepareForModel } from "../src/scanner/embedding";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");
const indexDir = join(here, "..", "public", "data", "scan-index");
const referenceModel = join(here, "..", ".cache", "models", "model.onnx");

const otherModel = process.argv[2];
if (!otherModel) throw new Error("Aufruf: model-compare.mjs <anderesModell> [--count 40]");
const countFlag = process.argv.indexOf("--count");
const sampleSize = countFlag === -1 ? 40 : Number(process.argv[countFlag + 1]);

const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});

const faces: { image: string; name: string }[] = [];
const lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
let row = 0;
const stride = Math.max(1, Math.floor(111131 / sampleSize));
for await (const line of lines) {
    if (line && row % stride === 0 && faces.length < sampleSize) faces.push({ ...JSON.parse(line), row });
    row += 1;
}

/**
 * Loads a session and returns a function embedding one prepared image
 *
 * @param path to the .onnx file
 * @returns the embedder
 */
async function open(path: string) {
    const session = await ort.InferenceSession.create(path, { intraOpNumThreads: 4 });
    const input = session.inputNames[0];
    const output = session.outputNames[0];
    return async (chw: Float32Array): Promise<Float32Array> => {
        const result = await session.run({
            [input]: new ort.Tensor("float32", chw, [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
        });
        const tensor = result[output];
        return poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];
    };
}

const reference = await open(referenceModel);
const other = await open(otherModel);

let agreement = 0;
let sameTop = 0;
let referenceHits = 0;
let otherHits = 0;
let referenceMs = 0;
let otherMs = 0;

for (const face of faces) {
    const { data, info } = await sharp(join(cacheDir, face.image))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const image: RgbaImage = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
    const chw = await prepareForModel(image);

    let started = Date.now();
    const a = await reference(chw);
    referenceMs += Date.now() - started;
    started = Date.now();
    const b = await other(chw);
    otherMs += Date.now() - started;

    let dot = 0;
    for (let d = 0; d < a.length; d += 1) dot += a[d] * b[d];
    agreement += dot;

    const hitA = index.search(index.project(a), 1)[0];
    const hitB = index.search(index.project(b), 1)[0];
    if (hitA && hitB && hitA.printing.id === hitB.printing.id) sameTop += 1;
    if (hitA?.printing.name === face.name) referenceHits += 1;
    if (hitB?.printing.name === face.name) otherHits += 1;
}

const n = faces.length;
process.stdout.write(
    `${n} Referenzbilder\n` +
        `mittlerer Kosinus zwischen den Modellen  ${(agreement / n).toFixed(4)}\n` +
        `gleicher Top-1                           ${sameTop}/${n}\n` +
        `Selbsttreffer Referenzmodell             ${referenceHits}/${n}\n` +
        `Selbsttreffer anderes Modell             ${otherHits}/${n}\n` +
        `${(referenceMs / n).toFixed(0)} ms gegen ${(otherMs / n).toFixed(0)} ms pro Bild\n`,
);
