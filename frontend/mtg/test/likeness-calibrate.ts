//! Measures the mean row profile of real printings and checks how well it separates cards from
//! the wrong rectifications the detector produces.
//!
//! Positives come from the downloaded reference images, which are real printings at exactly the
//! rectification geometry. Negatives come from `test/detect-output/`, listed by hand in
//! `wrong.txt` after looking at the contact sheet. The profile is printed for pasting into
//! `CARD_PROFILE`; the separation report is what says whether it is worth using at all.
//!
//! Usage: node test/likeness-calibrate.mjs [sampleSize]
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PROFILE_BANDS, rowProfile } from "../src/scanner/card-likeness";
import { RECTIFIED_HEIGHT, RECTIFIED_WIDTH } from "../src/scanner/card-detect";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(here, "..", ".cache", "scryfall", "images");
const outputDir = join(here, "detect-output");
const wrongList = join(here, "likeness-negatives.txt");

const sampleSize = Number(process.argv[2] ?? "2000");

/**
 * Decodes an image into the rectification geometry
 *
 * @param path
 * @returns
 */
async function readRectified(path: string): Promise<RgbaImage> {
    const { data, info } = await sharp(path)
        .resize(RECTIFIED_WIDTH, RECTIFIED_HEIGHT, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * Picks `count` reference images spread across the shard directories
 *
 * @param count
 * @returns absolute paths
 */
async function sampleReferences(count: number): Promise<string[]> {
    const buckets = (await readdir(imagesDir)).sort();
    const perBucket = Math.max(1, Math.ceil(count / buckets.length));
    const picked: string[] = [];
    for (const bucket of buckets) {
        const files = await readdir(join(imagesDir, bucket)).catch(() => []);
        for (const file of files.slice(0, perBucket)) picked.push(join(imagesDir, bucket, file));
        if (picked.length >= count) break;
    }
    return picked.slice(0, count);
}

/**
 * Cosine similarity between a profile and the template
 *
 * @param profile
 * @param template
 * @returns
 */
function similarity(profile: number[], template: number[]): number {
    let dot = 0;
    let norm = 0;
    for (let band = 0; band < PROFILE_BANDS; band += 1) {
        dot += profile[band] * template[band];
        norm += template[band] * template[band];
    }
    return norm < 1e-9 ? 0 : dot / Math.sqrt(norm);
}

/**
 * Quantiles of a numeric sample
 *
 * @param values
 * @param at
 * @returns
 */
function quantile(values: number[], at: number): number {
    const sorted = [...values].sort((first, second) => first - second);
    return sorted[Math.min(sorted.length - 1, Math.floor(at * sorted.length))];
}

async function main(): Promise<void> {
    const references = await sampleReferences(sampleSize);
    process.stdout.write(`${references.length} Referenzbilder\n`);

    const half = Math.floor(references.length / 2);
    const template = new Array<number>(PROFILE_BANDS).fill(0);
    for (const path of references.slice(0, half)) {
        const profile = rowProfile(await readRectified(path));
        for (let band = 0; band < PROFILE_BANDS; band += 1) template[band] += profile[band];
    }
    const norm = Math.hypot(...template);
    for (let band = 0; band < PROFILE_BANDS; band += 1) template[band] /= norm;

    const positives: number[] = [];
    for (const path of references.slice(half)) {
        positives.push(similarity(rowProfile(await readRectified(path)), template));
    }

    const negativeNames = await readFile(wrongList, "utf8")
        .then((text) =>
            text
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith("#")),
        )
        .catch(() => [] as string[]);
    const negatives: number[] = [];
    for (const name of negativeNames) {
        const path = join(outputDir, `${name}-rectified.jpg`);
        const score = await readRectified(path)
            .then((image) => similarity(rowProfile(image), template))
            .catch(() => null);
        if (score !== null) negatives.push(score);
        process.stdout.write(`  negativ ${name.padEnd(32)} ${score === null ? "fehlt" : score.toFixed(3)}\n`);
    }

    process.stdout.write(
        `\npositiv  n=${positives.length}  p01 ${quantile(positives, 0.01).toFixed(3)}  ` +
            `p05 ${quantile(positives, 0.05).toFixed(3)}  median ${quantile(positives, 0.5).toFixed(3)}\n`,
    );
    if (negatives.length) {
        process.stdout.write(
            `negativ  n=${negatives.length}  median ${quantile(negatives, 0.5).toFixed(3)}  ` +
                `p95 ${quantile(negatives, 0.95).toFixed(3)}  max ${Math.max(...negatives).toFixed(3)}\n`,
        );
        const threshold = quantile(positives, 0.05);
        const rejected = negatives.filter((value) => value < threshold).length;
        process.stdout.write(
            `\nbei Schwelle ${threshold.toFixed(3)} (5% der echten Karten fallen durch): ` +
                `${rejected}/${negatives.length} Fehlausschnitte abgewiesen\n`,
        );
    }

    process.stdout.write(`\nCARD_PROFILE = [\n    ${template.map((value) => value.toFixed(5)).join(", ")},\n];\n`);
}

await main();
