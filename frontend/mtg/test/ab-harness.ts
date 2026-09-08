//! Compares recognition variants against a small reference index, so a change can be judged in
//! minutes instead of the forty-five it costs to re-embed the whole catalogue.
//!
//! The sub-index holds every printing of the decklist plus a fixed sample of distractors. Recall
//! measured here is optimistic against the full index and must never be quoted as the result;
//! what it is good for is the difference between two variants measured on the same rows, which
//! is what a change has to earn.
//!
//! Usage: node test/ab-harness.mjs <photoDir> <decklist> [--variant none|balance] [--distractors 6000]
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { detectCardsIn, rectifyCardIn, refineToCardEdge, shrinkQuad } from "../src/scanner/card-detect";
import type { RgbaImage } from "../src/scanner/card-detect";
import { greyWorldBalance, IMAGE_SIZE, poolHidden, preprocess } from "../src/scanner/embedding";
import { equaliseLocalContrast } from "../src/scanner/image-quality";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");
const modelPath = join(here, "..", ".cache", "models", "model.onnx");

/** Trim fractions tried per quad when the sleeve edge is not located properly. */
const BLIND_INSETS = [0, 0.04];
/** Only the CLS half of the stored vector is used: the patch mean measured clearly worse. */
const CLS_DIM = 384;

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const [photoDir, decklistPath] = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const variant = option("--variant", "none");
const features = new Set(variant.split("+"));
/** Refinement locates the card edge itself, which is what the blind trim only approximates. */
const insets = features.has("refine") ? [0] : BLIND_INSETS;
const distractorCount = Number(option("--distractors", "6000"));

/**
 * A reference row in the sub-index
 */
type Face = { image: string; name: string; set: string; collectorNumber: string };

/**
 * Applies the variant's preprocessing chain
 *
 * @param image
 * @returns model input
 */
async function prepare(image: RgbaImage): Promise<Float32Array> {
    let prepared = features.has("balance") ? greyWorldBalance(image) : image;
    if (features.has("clahe")) prepared = await equaliseLocalContrast(prepared);
    return preprocess(prepared);
}

async function readImage(path: string, rotate = false): Promise<RgbaImage> {
    const pipeline = rotate ? sharp(path).rotate() : sharp(path);
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function main(): Promise<void> {
    const wanted = new Set<string>();
    const wantedNames = new Set<string>();
    for (const line of (await readFile(decklistPath, "utf8")).split("\n")) {
        if (/^sideboard\b/i.test(line.trim())) break;
        const match = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\S+?)(\s+\*F\*)?\s*$/.exec(line.trim());
        if (!match) continue;
        wanted.add(`${match[3].toLowerCase()}/${match[4].toUpperCase()}`);
        wantedNames.add(match[2].split(" //")[0].toLowerCase());
    }

    const faces: Face[] = [];
    const lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
    for await (const line of lines) if (line) faces.push(JSON.parse(line));

    const chosen: Face[] = [];
    const seen = new Set<number>();
    faces.forEach((face, row) => {
        if (wanted.has(`${face.set}/${face.collectorNumber.toUpperCase()}`)) {
            chosen.push(face);
            seen.add(row);
        }
    });
    const stride = Math.max(1, Math.floor(faces.length / distractorCount));
    for (let row = 0; row < faces.length && chosen.length < distractorCount + wanted.size; row += stride) {
        if (!seen.has(row)) chosen.push(faces[row]);
    }
    process.stdout.write(
        `Variante "${variant}"  Teilindex ${chosen.length} Zeilen (${wanted.size} aus dem Deck)\n`,
    );

    const session = await ort.InferenceSession.create(modelPath, { intraOpNumThreads: 12 });
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const embed = async (image: RgbaImage): Promise<Float32Array> => {
        const output = await session.run({
            [inputName]: new ort.Tensor("float32", await prepare(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
        });
        const tensor = output[outputName];
        const pooled = poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];
        const vector = pooled.slice(0, CLS_DIM);
        let norm = 0;
        for (let d = 0; d < CLS_DIM; d += 1) norm += vector[d] * vector[d];
        norm = Math.sqrt(norm) || 1;
        for (let d = 0; d < CLS_DIM; d += 1) vector[d] /= norm;
        return vector;
    };

    const started = Date.now();
    const matrix = new Float32Array(chosen.length * CLS_DIM);
    for (const [row, face] of chosen.entries()) {
        matrix.set(await embed(await readImage(join(cacheDir, face.image))), row * CLS_DIM);
        if (row % 500 === 0) {
            process.stderr.write(`\rReferenzen ${row}/${chosen.length}   `);
        }
    }
    process.stderr.write(`\rReferenzen fertig in ${((Date.now() - started) / 1000).toFixed(0)} s        \n`);

    const search = (query: Float32Array): { face: Face; score: number } => {
        let best = -Infinity;
        let bestRow = 0;
        for (let row = 0; row < chosen.length; row += 1) {
            const offset = row * CLS_DIM;
            let sum = 0;
            for (let d = 0; d < CLS_DIM; d += 1) sum += query[d] * matrix[offset + d];
            if (sum > best) {
                best = sum;
                bestRow = row;
            }
        }
        return { face: chosen[bestRow], score: best };
    };

    const files = (await readdir(photoDir))
        .filter((file) => [".jpg", ".jpeg", ".png"].includes(extname(file).toLowerCase()))
        .sort();

    let nameHits = 0;
    let printingHits = 0;
    const foundNames = new Set<string>();
    for (const file of files) {
        const pixels = await readImage(join(photoDir, file), true);
        const cards = await detectCardsIn(pixels);
        let best: { face: Face; score: number } | null = null;
        for (const card of cards.slice(0, 2)) {
            for (const inset of insets) {
                const quad = inset === 0 ? card.quad : shrinkQuad(card.quad, inset);
                for (let rotation = 0; rotation < 4; rotation += 1) {
                    const rectified = await rectifyCardIn(pixels, quad, rotation);
                    const variants = [rectified];
                    if (features.has("refine")) {
                        const refined = await refineToCardEdge(rectified);
                        if (refined) variants.push(refined);
                    }
                    for (const image of variants) {
                        const found = search(await embed(image));
                        if (!best || found.score > best.score) best = found;
                    }
                }
            }
        }
        if (!best) continue;
        const name = best.face.name.split(" //")[0].toLowerCase();
        if (wantedNames.has(name)) {
            nameHits += 1;
            foundNames.add(name);
        }
        if (wanted.has(`${best.face.set}/${best.face.collectorNumber.toUpperCase()}`)) printingHits += 1;
    }

    process.stdout.write(
        `Name    ${nameHits}/${files.length}\n` +
            `Druck   ${printingHits}/${files.length}\n` +
            `Namen abgedeckt ${foundNames.size}/${wantedNames.size}\n`,
    );
}

await main();
