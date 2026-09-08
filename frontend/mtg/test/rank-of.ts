//! Reports where a known printing lands in the index for a given crop.
//!
//! "The scanner says the wrong card" has two very different causes: the right card sits just
//! below the wrong one, in which case a deeper shortlist and verification fix it, or it is
//! hundreds of rows down, in which case the embedding has failed and no amount of shortlist
//! depth will help. Only the rank tells them apart.
//!
//! Usage: node test/rank-of.mjs <cropImage> <set> <collectorNumber>
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { IMAGE_SIZE, poolHidden, prepareForModel } from "../src/scanner/embedding";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");

const [cropPath, wantedSet, wantedNumber] = process.argv.slice(2);
if (!cropPath || !wantedSet || !wantedNumber) {
    throw new Error("Aufruf: rank-of.mjs <ausschnitt> <set> <sammlernummer>");
}

const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});

const session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
    intraOpNumThreads: 8,
});

const { data, info } = await sharp(cropPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const image: RgbaImage = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };

const output = await session.run({
    [session.inputNames[0]]: new ort.Tensor("float32", await prepareForModel(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
});
const tensor = output[session.outputNames[0]];
const vector = poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];

const projected = index.project(vector);
const matches = index.search(projected, 2000);

const named = process.argv[5];
if (named) {
    process.stdout.write(`Auf den Namen "${named}" eingeschränkt:\n`);
    for (const [position, match] of index.searchNamed(projected, named, 10).entries()) {
        process.stdout.write(
            `  ${String(position).padStart(4)}  ${match.score.toFixed(4)}  ` +
                `${match.printing.set.toUpperCase()} ${match.printing.collectorNumber}\n`,
        );
    }
    process.stdout.write("\n");
}
const rank = matches.findIndex(
    (match) =>
        match.printing.set.toLowerCase() === wantedSet.toLowerCase() &&
        match.printing.collectorNumber.toLowerCase() === wantedNumber.toLowerCase(),
);

process.stdout.write("Beste zehn:\n");
for (const [position, match] of matches.slice(0, 10).entries()) {
    process.stdout.write(
        `  ${String(position).padStart(4)}  ${match.score.toFixed(4)}  ` +
            `${match.printing.name.slice(0, 34).padEnd(34)} ${match.printing.set.toUpperCase()} ${match.printing.collectorNumber}\n`,
    );
}
if (rank < 0) {
    process.stdout.write(`\n${wantedSet.toUpperCase()} ${wantedNumber} nicht unter den besten ${matches.length}\n`);
} else {
    process.stdout.write(
        `\n${wantedSet.toUpperCase()} ${wantedNumber} auf Platz ${rank} mit ${matches[rank].score.toFixed(4)}\n`,
    );
}
