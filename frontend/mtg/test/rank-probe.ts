//! Reports where a known printing ranks for a given crop, and what beat it.
//!
//! "The scanner said the wrong card" leaves the important question open: was the right one close
//! behind, or nowhere at all. The first is a ranking problem, the second means the crop and the
//! reference have nothing in common, and the two call for entirely different work.
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { IMAGE_SIZE, poolHidden, preprocess } from "../src/scanner/embedding";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");
const [cropPath, wantedSet] = process.argv.slice(2);

const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});

const session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
    intraOpNumThreads: 12,
});

async function read(path: string): Promise<RgbaImage> {
    const { data, info } = await sharp(path).resize(488, 680, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function embed(image: RgbaImage): Promise<Float32Array> {
    const output = await session.run({
        [session.inputNames[0]]: new ort.Tensor("float32", preprocess(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
    });
    const tensor = output[session.outputNames[0]];
    return poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];
}

const matches = index.search(index.project(await embed(await read(cropPath))), 3000);
console.log("Beste Treffer:");
for (const match of matches.slice(0, 8)) {
    console.log(`  ${match.score.toFixed(4)}  ${match.printing.name.slice(0, 34).padEnd(36)} ${match.printing.set} ${match.printing.collectorNumber}`);
}
const rank = matches.findIndex((match) => match.printing.set === wantedSet);
console.log(
    rank === -1
        ? `\n${wantedSet} nicht unter den ersten ${matches.length}`
        : `\n${wantedSet} auf Rang ${rank + 1} mit ${matches[rank].score.toFixed(4)}: ${matches[rank].printing.name} ${matches[rank].printing.collectorNumber}`,
);
