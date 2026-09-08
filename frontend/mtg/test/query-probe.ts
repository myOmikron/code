//! Compares one photo's rectified crop with the reference image of the card it shows.
//!
//! Isolates where similarity is lost: in the model, or in the projection to the index space.
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { IMAGE_SIZE, poolHidden, preprocess } from "../src/scanner/embedding";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");
const cacheDir = join(here, "..", ".cache", "scryfall");

const [cropPath, wantSet, wantNumber] = process.argv.slice(2);

const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});

const faces: { image: string; name: string; set: string; collectorNumber: string }[] = [];
const lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
for await (const line of lines) if (line) faces.push(JSON.parse(line));
const reference = faces.find(
    (face) => face.set === wantSet && face.collectorNumber.toUpperCase() === wantNumber.toUpperCase(),
);
if (!reference) throw new Error("Referenz nicht gefunden");

const session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
    intraOpNumThreads: 12,
});
const inputName = session.inputNames[0];
const outputName = session.outputNames[0];

async function read(path: string): Promise<RgbaImage> {
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function embed(image: RgbaImage): Promise<Float32Array> {
    const output = await session.run({
        [inputName]: new ort.Tensor("float32", preprocess(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
    });
    const tensor = output[outputName];
    return poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];
}

const dot = (a: Float32Array, b: Float32Array) => a.reduce((sum, value, i) => sum + value * b[i], 0);

const cropImage = await read(cropPath);
const referenceImage = await read(join(cacheDir, reference.image));
console.log(`Ausschnitt ${cropImage.width}x${cropImage.height}, Referenz ${referenceImage.width}x${referenceImage.height}`);

async function inset(image: RgbaImage, fraction: number): Promise<RgbaImage> {
    const left = Math.round(image.width * fraction);
    const top = Math.round(image.height * fraction);
    const { data, info } = await sharp(Buffer.from(image.data), {
        raw: { width: image.width, height: image.height, channels: 4 },
    })
        .extract({ left, top, width: image.width - 2 * left, height: image.height - 2 * top })
        .resize(image.width, image.height, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

const cropRaw = await embed(cropImage);
const referenceRaw = await embed(referenceImage);
console.log(`roh 768-dim  cos(Ausschnitt, Referenz) = ${dot(cropRaw, referenceRaw).toFixed(4)}`);

const cropProjected = index.project(cropRaw);
const referenceProjected = index.project(referenceRaw);
console.log(`nach PCA 128 cos                      = ${dot(cropProjected, referenceProjected).toFixed(4)}`);

for (const fraction of [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08]) {
    const shrunk = await embed(await inset(cropImage, fraction));
    const projected = index.project(shrunk);
    const top = index.search(projected, 1)[0];
    console.log(
        `  einwärts ${(fraction * 100).toFixed(0).padStart(2)}%  roh ${dot(shrunk, referenceRaw).toFixed(4)}  ` +
            `pca ${dot(projected, referenceProjected).toFixed(4)}  bestes: ${top.printing.name} (${top.printing.set}) ${top.score.toFixed(3)}`,
    );
}

for (const [label, vector] of [["Referenz", referenceProjected], ["Ausschnitt", cropProjected]] as const) {
    const top = index.search(vector, 3);
    console.log(
        `Suche mit ${label.padEnd(11)} -> ` +
            top.map((m) => `${m.printing.name} (${m.printing.set}) ${m.score.toFixed(3)}`).join("  |  "),
    );
}
