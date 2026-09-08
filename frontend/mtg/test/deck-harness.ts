//! Scans a folder of photos against a known decklist and reports what the scanner got.
//!
//! This is the evaluation that matches how the app is actually used: a stack of cards goes past
//! the camera and the answer is a list. The photo order is not known and does not matter, so
//! nothing is scored per frame. What is scored is the set: how many photos produced a printing
//! that is really in the deck, and how much of the deck was found at all.
//!
//! Two numbers are kept apart on purpose. Getting the *name* right is the retrieval problem;
//! getting the *printing* right is the reprint problem, and a deck of The List and Secret Lair
//! cards is a hard case for the second one.
//!
//! Usage: node test/deck-harness.mjs <photoDir> <decklist> [--quads 2] [--limit 5]
import { gunzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { detectCardsIn, rectifyCardIn, shrinkQuad } from "../src/scanner/card-detect";
import type { RgbaImage } from "../src/scanner/card-detect";
import { IMAGE_SIZE, PREPROCESSING, poolHidden, prepareForModel } from "../src/scanner/embedding";
import type { Preprocessing } from "../src/scanner/embedding";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";
import type { IndexMatch } from "../src/scanner/embedding-index";

const here = dirname(fileURLToPath(import.meta.url));

const modelPath = join(here, "..", ".cache", "models", "model.onnx");

/**
 * One line of a decklist
 */
type Wanted = { count: number; name: string; set: string; number: string; foil: boolean };

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const [photoDir, decklistPath] = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const quadCount = Number(option("--quads", "2"));
const resultLimit = Number(option("--limit", "5"));

/** Trim fractions tried per quad, covering an unsleeved card and common sleeve thicknesses. */
const INSETS = [0, 0.04];
/** Search the unprojected float vectors instead of the packed index, to measure the ceiling. */
const useRawVectors = process.argv.includes("--raw");
/** Which half of the stored vector the raw search uses: cls, patch or both. */
const rawHalf = option("--half", "both");

/**
 * Which index to search and which preprocessing to send queries through.
 *
 * The two belong together: an index built one way and a query prepared the other way land in
 * different spaces, so a mismatch is a measurement of nothing. `createEmbeddingIndex` is told
 * what this run applies and refuses the pairing if the manifest disagrees.
 */
const variant = option("--preprocessing", PREPROCESSING) as Preprocessing;
const indexDir = option("--index", join(here, "..", "public", "data", "scan-index"));

/**
 * Parses a decklist in the "1 Name (SET) NUMBER *F*" format.
 *
 * Parsing stops at a SIDEBOARD marker: a sideboard is not part of the physical stack being
 * scanned, and counting it would understate coverage by cards that were never in front of the
 * camera.
 *
 * @param text
 * @returns one entry per line of the main deck
 */
function parseDecklist(text: string): Wanted[] {
    const entries: Wanted[] = [];
    for (const line of text.split("\n")) {
        if (/^sideboard\b/i.test(line.trim())) break;
        const match = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\S+?)(\s+\*F\*)?\s*$/.exec(line.trim());
        if (!match) continue;
        entries.push({
            count: Number(match[1]),
            name: match[2],
            set: match[3].toLowerCase(),
            number: match[4].toUpperCase(),
            foil: Boolean(match[5]),
        });
    }
    return entries;
}

/**
 * Decodes a photo into RGBA, honouring EXIF rotation
 *
 * @param path
 * @returns
 */
async function readImage(path: string): Promise<RgbaImage> {
    const { data, info } = await sharp(path).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function main(): Promise<void> {
    if (!photoDir || !decklistPath) throw new Error("Aufruf: deck-harness.mjs <fotoOrdner> <deckliste>");

    const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
    const index = createEmbeddingIndex(
        {
            manifest,
            projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
            vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
            cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
        },
        variant,
    );

    let searchRaw: ((query: Float32Array, limit: number) => IndexMatch[]) | null = null;
    if (useRawVectors) {
        const raw = new Float32Array(
            (await readFile(join(here, "..", ".cache", "scryfall", "embeddings", "dinov2-small.f32")))
                .buffer as ArrayBuffer,
        );
        const cards = JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8"));
        const dim = 768;
        const rows = raw.length / dim;
        const from = rawHalf === "patch" ? 384 : 0;
        const to = rawHalf === "cls" ? 384 : 768;
        const width = to - from;
        const slice = new Float32Array(rows * width);
        for (let row = 0; row < rows; row += 1) {
            let norm = 0;
            for (let d = 0; d < width; d += 1) {
                const value = raw[row * dim + from + d];
                slice[row * width + d] = value;
                norm += value * value;
            }
            norm = Math.sqrt(norm) || 1;
            for (let d = 0; d < width; d += 1) slice[row * width + d] /= norm;
        }
        searchRaw = (query, limit) => {
            const scores = new Float32Array(limit).fill(-Infinity);
            const picks = new Int32Array(limit).fill(-1);
            const cut = new Float32Array(width);
            let queryNorm = 0;
            for (let d = 0; d < width; d += 1) {
                cut[d] = query[from + d];
                queryNorm += cut[d] * cut[d];
            }
            queryNorm = Math.sqrt(queryNorm) || 1;
            for (let d = 0; d < width; d += 1) cut[d] /= queryNorm;

            for (let row = 0; row < rows; row += 1) {
                const offset = row * width;
                let sum = 0;
                for (let d = 0; d < width; d += 1) sum += cut[d] * slice[offset + d];
                if (sum <= scores[limit - 1]) continue;
                let slot = limit - 1;
                while (slot > 0 && scores[slot - 1] < sum) {
                    scores[slot] = scores[slot - 1];
                    picks[slot] = picks[slot - 1];
                    slot -= 1;
                }
                scores[slot] = sum;
                picks[slot] = row;
            }
            return Array.from({ length: limit }, (_unused, rank) => rank)
                .filter((rank) => picks[rank] >= 0)
                .map((rank) => {
                    const card = cards[picks[rank]];
                    return {
                        score: scores[rank],
                        printing: {
                            id: card.i,
                            name: card.n,
                            set: card.s,
                            collectorNumber: card.c,
                            lang: card.l,
                            face: card.f,
                        },
                    };
                });
        };
        process.stdout.write(`Rohvektoren: ${rows} Zeilen, Hälfte "${rawHalf}", ${width} Dim.\n`);
    }

    const wanted = parseDecklist(await readFile(decklistPath, "utf8"));
    const wantedPrintings = new Set(wanted.map((entry) => `${entry.set}/${entry.number}`));
    const wantedNames = new Set(wanted.map((entry) => entry.name.split(" //")[0].toLowerCase()));
    const files = (await readdir(photoDir))
        .filter((file) => [".jpg", ".jpeg", ".png"].includes(extname(file).toLowerCase()))
        .sort();

    process.stdout.write(
        `Index ${manifest.count} Printings à ${manifest.dim} Dim.  ` +
            `Deck ${wanted.length} Drucke, ${wantedNames.size} Namen.  ${files.length} Fotos\n\n`,
    );

    const session = await ort.InferenceSession.create(modelPath, { intraOpNumThreads: 12 });
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const embed = async (image: RgbaImage): Promise<Float32Array> => {
        const output = await session.run({
            [inputName]: new ort.Tensor("float32", await prepareForModel(image, variant), [
                1,
                3,
                IMAGE_SIZE,
                IMAGE_SIZE,
            ]),
        });
        const tensor = output[outputName];
        return poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];
    };

    const foundPrintings = new Set<string>();
    const foundNames = new Set<string>();
    let printingHits = 0;
    let nameHits = 0;
    let noDetection = 0;
    const failures: string[] = [];
    const started = Date.now();

    for (const file of files) {
        const pixels = await readImage(join(photoDir, file));
        const cards = await detectCardsIn(pixels);
        if (cards.length === 0) {
            noDetection += 1;
            failures.push(`${file}  keine Detektion`);
            continue;
        }

        let best: IndexMatch[] = [];
        for (const card of cards.slice(0, quadCount)) {
            for (const inset of INSETS) {
                const quad = inset === 0 ? card.quad : shrinkQuad(card.quad, inset);
                for (let rotation = 0; rotation < 4; rotation += 1) {
                    const rectified = await rectifyCardIn(pixels, quad, rotation);
                    const embedding = await embed(rectified);
                    const matches = searchRaw
                        ? searchRaw(embedding, resultLimit)
                        : index.search(index.project(embedding), resultLimit);
                    if (matches.length && (!best.length || matches[0].score > best[0].score)) best = matches;
                }
            }
        }

        const top = best[0];
        if (!top) {
            noDetection += 1;
            continue;
        }
        const key = `${top.printing.set}/${top.printing.collectorNumber.toUpperCase()}`;
        const name = top.printing.name.split(" //")[0].toLowerCase();

        if (wantedPrintings.has(key)) {
            printingHits += 1;
            foundPrintings.add(key);
        }
        if (wantedNames.has(name)) {
            nameHits += 1;
            foundNames.add(name);
        } else {
            failures.push(
                `${file}  -> ${top.printing.name} (${top.printing.set.toUpperCase()}) ` +
                    `${top.printing.collectorNumber}  cos ${top.score.toFixed(3)}`,
            );
        }
    }

    const elapsed = (Date.now() - started) / 1000;
    process.stdout.write(
        `Foto trifft Kartennamen aus dem Deck   ${nameHits}/${files.length}\n` +
            `Foto trifft exakten Druck              ${printingHits}/${files.length}\n` +
            `Deck-Namen abgedeckt                   ${foundNames.size}/${wantedNames.size}\n` +
            `Deck-Drucke abgedeckt                  ${foundPrintings.size}/${wantedPrintings.size}\n` +
            `ohne Detektion                         ${noDetection}\n` +
            `${(elapsed / Math.max(files.length, 1)).toFixed(2)} s pro Foto\n`,
    );

    if (failures.length) {
        process.stdout.write(`\nFehlschläge (${failures.length}):\n`);
        for (const failure of failures) process.stdout.write(`  ${failure}\n`);
    }
}

await main();
