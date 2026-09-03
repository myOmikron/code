//! Verifies the packed index against its own source images.
//!
//! Embedding a reference image that is already in the index must return that very row with a
//! cosine near one. If it does not, the fault is in the index, the projection or the search,
//! and no amount of work on detection will help.
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { IMAGE_SIZE, poolHidden, prepareForModel } from "../src/scanner/embedding";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");
const cacheDir = join(here, "..", ".cache", "scryfall");

const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});

const faces: { image: string; name: string; set: string; collectorNumber: string; lang?: string }[] = [];
const lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
for await (const line of lines) if (line) faces.push(JSON.parse(line));

const session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
    intraOpNumThreads: 12,
});
const inputName = session.inputNames[0];
const outputName = session.outputNames[0];

let exact = 0;
/**
 * Four rows per language, spread over the rows that language occupies.
 *
 * A language that was never embedded, or embedded against a catalogue that had shifted under it,
 * shows up nowhere else: every vector before it still verifies perfectly. Spread over the whole
 * span rather than taken from one place, because the languages appended later each occupy one
 * unbroken block and a half-written block would otherwise pass on its first row alone.
 *
 * Derived rather than written down: a hand-kept list silently stops covering whatever is appended
 * after it. An earlier one ended at the last row of the English and Japanese catalogue and would
 * have passed an index whose ten appended languages were empty. Grouped by language rather than
 * by run, because the oldest part of the catalogue is not sorted at all and its 5187 runs would
 * mean fifteen thousand model runs to check one index.
 *
 * @returns the rows to check, ascending
 */
function sampleRows(): number[] {
    const byLanguage = new Map<string, number[]>();
    for (let row = 0; row < faces.length; row += 1) {
        const language = faces[row].lang ?? "?";
        const rows = byLanguage.get(language);
        if (rows) rows.push(row);
        else byLanguage.set(language, [row]);
    }

    const picked = new Set<number>([0, faces.length - 1]);
    for (const rows of byLanguage.values()) {
        for (const share of [0, 1 / 3, 2 / 3, 1]) {
            picked.add(rows[Math.min(rows.length - 1, Math.floor(share * rows.length))]);
        }
    }
    return [...picked].sort((a, b) => a - b);
}

const rows = sampleRows();
for (const row of rows) {
    const face = faces[row];
    const { data, info } = await sharp(join(cacheDir, face.image))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const embedding = poolHidden(
        (
            await session.run({
                [inputName]: new ort.Tensor(
                    "float32",
                    await prepareForModel({
                        data: new Uint8ClampedArray(data),
                        width: info.width,
                        height: info.height,
                    }),
                    [1, 3, IMAGE_SIZE, IMAGE_SIZE],
                ),
            })
        )[outputName].data as Float32Array,
        1,
        257,
    )[0];
    const matches = index.search(index.project(embedding), 3);
    const hit = matches[0].printing.name === face.name && matches[0].printing.set === face.set;
    if (hit) exact += 1;
    process.stdout.write(
        `Zeile ${String(row).padStart(6)}  ${face.name.slice(0, 22).padEnd(23)} -> ` +
            `${matches[0].printing.name.slice(0, 22).padEnd(23)} cos ${matches[0].score.toFixed(4)}  ` +
            `${hit ? "OK" : "FALSCH"}  (2. ${matches[1].score.toFixed(3)})\n`,
    );
}
process.stdout.write(`\n${exact}/${rows.length} Selbsttreffer\n`);
