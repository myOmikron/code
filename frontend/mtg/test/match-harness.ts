//! End-to-end recognition over the labeled photos: detect, rectify, embed, search, compare.
//!
//! This runs the whole chain the app runs, on real photos with known answers, and is the only
//! number in this project worth optimising against. Detection rate and rectification quality are
//! diagnostics; this is the result.
//!
//! Both orientations of each candidate quad are searched, because the detector deliberately does
//! not resolve the 180° ambiguity, and the top few quads are searched rather than only the best,
//! because the index is a far better judge of what is a card than the geometry is.
//!
//! Usage: node test/match-harness.mjs [--quads 2] [--limit 5] [--labels FILE] [--images DIR]
//!            [--preprocessing clahe4+area224] [--index DIR]
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
 * One entry of the hand-written label file
 */
type Label = { file: string; name: string; set: string; number: string };

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const quadCount = Number(option("--quads", "2"));
const resultLimit = Number(option("--limit", "5"));

/**
 * Which index to search and which preprocessing to send queries through.
 *
 * The two belong together: an index built one way and a query prepared the other way land in
 * different spaces, so a mismatch measures nothing. `createEmbeddingIndex` is told what this run
 * applies and refuses the pairing if the manifest disagrees.
 */
const variant = option("--preprocessing", PREPROCESSING) as Preprocessing;
const indexDir = option("--index", join(here, "..", "public", "data", "scan-index"));
const labelFile = option("--labels", join(here, "dataset", "labels.json"));
const imagesDir = option("--images", join(here, "dataset", "images"));

/** Trim fractions tried per quad, covering an unsleeved card and common sleeve thicknesses. */
const INSETS = [0, 0.04];

/**
 * Normalizes a set code or collector number for comparison
 *
 * @param value
 * @returns
 */
function normalize(value: string): string {
    return String(value)
        .trim()
        .toUpperCase()
        .replace(/^0+(?=\d)/, "");
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
    process.stdout.write(`Index: ${manifest.count} Printings, ${manifest.dim} Dimensionen\n\n`);

    const session = await ort.InferenceSession.create(modelPath, { intraOpNumThreads: 12 });
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    /**
     * Embeds one rectified card
     *
     * @param image
     * @returns the pooled vector
     */
    const embed = async (image: RgbaImage): Promise<Float32Array> => {
        const input = await prepareForModel(image, variant);
        const output = await session.run({
            [inputName]: new ort.Tensor("float32", input, [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
        });
        const tensor = output[outputName];
        return poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];
    };

    const labels: Label[] = JSON.parse(await readFile(labelFile, "utf8"));
    let nameTop1 = 0;
    let printingTop1 = 0;
    let nameTop5 = 0;
    let missed = 0;

    for (const label of labels) {
        const started = Date.now();
        const pixels = await readImage(join(imagesDir, label.file));
        const cards = await detectCardsIn(pixels);
        if (cards.length === 0) {
            missed += 1;
            process.stdout.write(`${label.file.padEnd(14)} ${label.name.padEnd(26)} KEINE DETEKTION\n`);
            continue;
        }

        let best: IndexMatch[] = [];
        for (const card of cards.slice(0, quadCount)) {
            for (const inset of INSETS) {
                const quad = inset === 0 ? card.quad : shrinkQuad(card.quad, inset);
                for (let rotation = 0; rotation < 4; rotation += 1) {
                    const rectified = await rectifyCardIn(pixels, quad, rotation);
                    const matches = index.search(index.project(await embed(rectified)), resultLimit);
                    if (matches.length && (!best.length || matches[0].score > best[0].score)) best = matches;
                }
            }
        }

        const elapsed = Date.now() - started;
        const top = best[0];
        const nameHit = top?.printing.name.toLowerCase().startsWith(label.name.toLowerCase().split(" //")[0]);
        const printingHit =
            nameHit &&
            normalize(top.printing.set) === normalize(label.set) &&
            normalize(top.printing.collectorNumber) === normalize(label.number);
        const inTop5 = best.some((match) =>
            match.printing.name.toLowerCase().startsWith(label.name.toLowerCase().split(" //")[0]),
        );

        if (nameHit) nameTop1 += 1;
        if (printingHit) printingTop1 += 1;
        if (inTop5) nameTop5 += 1;

        const mark = printingHit ? "++" : nameHit ? "+ " : inTop5 ? "~ " : "- ";
        process.stdout.write(
            `${mark} ${label.file.padEnd(12)} ${label.name.slice(0, 24).padEnd(25)} -> ` +
                `${(top?.printing.name ?? "-").slice(0, 24).padEnd(25)} ` +
                `${(top?.printing.set ?? "").toUpperCase().padEnd(5)}${(top?.printing.collectorNumber ?? "").padEnd(7)} ` +
                `cos ${(top?.score ?? 0).toFixed(3)}  ${elapsed} ms\n`,
        );
    }

    const total = labels.length;
    process.stdout.write(
        `\nName top-1      ${nameTop1}/${total}\n` +
            `Name top-${resultLimit}      ${nameTop5}/${total}\n` +
            `Printing top-1  ${printingTop1}/${total}\n` +
            `ohne Detektion  ${missed}/${total}\n`,
    );
}

await main();
