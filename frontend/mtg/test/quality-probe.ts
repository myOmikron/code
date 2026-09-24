//! Measures the labelled photographs as the frame gate would, sharp, blurred and darkened, and
//! counts how many each limit refuses. Usage: `pnpm run scan:quality`.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { detectCardsIn, rectifyCardIn } from "../src/scanner/card-detect";
import type { RgbaImage } from "../src/scanner/card-detect";
import { exposureOf, measureFrame } from "../src/scanner/image-quality";
import { guideRegion } from "../src/scanner/live-pipeline";
import { QUALITY_LIMITS } from "../src/scanner/frame-gate";

const [labelFile, imagesDir] = process.argv.slice(2);
if (!labelFile || !imagesDir) throw new Error("Aufruf: quality-probe.mjs <labels.json> <bildOrdner> [--frame 1280]");

/**
 * Reads one command line option
 *
 * @param flag
 * @param fallback
 * @returns the value after the flag, or the fallback
 */
function option(flag: string, fallback: string): string {
    const at = process.argv.indexOf(flag);
    return at === -1 ? fallback : process.argv[at + 1];
}

const frameSide = Number(option("--frame", "1280"));
/** Gaussian sigmas standing in for motion blur. */
const BLURS = [1, 2, 3];
/** The live scanner's detection size. */
const WORKING_SIZE = 420;
/** An upright phone. */
const VIEW_ASPECT = 9 / 16;

const labels: { file: string; name: string }[] = JSON.parse(await readFile(labelFile, "utf8"));

/**
 * Decodes a photo the way the gate sees it: rotated per EXIF and reduced to the frame's long side
 *
 * @param path
 * @param blur Gaussian sigma to apply, 0 for none
 * @param gain multiplier on brightness, 1 for none
 * @returns the pixels
 */
async function readFrame(path: string, blur: number, gain: number): Promise<RgbaImage> {
    let image = sharp(path)
        .rotate()
        .resize({ width: frameSide, height: frameSide, fit: "inside", withoutEnlargement: true });
    if (blur > 0) image = image.blur(blur);
    if (gain !== 1) image = image.linear(gain, 0);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * Detects and measures the largest card in one frame
 *
 * @param pixels
 * @returns the measures, or null when nothing was detected
 */
async function measure(pixels: RgbaImage) {
    const cards = await detectCardsIn(pixels, { maxCards: 1, workingSize: WORKING_SIZE });
    if (cards.length === 0) return null;
    const crop = await rectifyCardIn(pixels, cards[0].quad, 0);
    const measured = await measureFrame(crop, cards[0].quad, cards[0].areaFraction, cards[0].quad);
    // The live gate searches only the guide region, so rescale the area to match `minArea`.
    const region = guideRegion(pixels.width, pixels.height, VIEW_ASPECT);
    const guided = (measured.areaFraction * pixels.width * pixels.height) / (region.width * region.height);
    return { ...measured, guidedArea: guided };
}

const columns = ["sharp", ...BLURS.map((sigma) => `blur${sigma}`), "dark"];
process.stdout.write(`${"file".padEnd(18)} ${columns.map((name) => name.padStart(8)).join(" ")}   area  guided  symm  mean  clip\n`);

const sharpValues: number[] = [];
const guidedAreas: number[] = [];
const symmetries: number[] = [];
const clips: number[] = [];
const blurredValues: number[][] = BLURS.map(() => []);
let undetected = 0;

for (const label of labels) {
    const path = join(imagesDir, label.file);
    const row: string[] = [];
    const original = await measure(await readFrame(path, 0, 1));
    if (!original) {
        undetected += 1;
        process.stdout.write(`${label.file.padEnd(18)} KEINE DETEKTION\n`);
        continue;
    }
    sharpValues.push(original.sharpness);
    guidedAreas.push(original.guidedArea);
    symmetries.push(original.symmetry);
    clips.push(original.exposure.clipped);
    row.push(original.sharpness.toFixed(0).padStart(8));

    for (const [position, sigma] of BLURS.entries()) {
        const degraded = await measure(await readFrame(path, sigma, 1));
        if (degraded) blurredValues[position].push(degraded.sharpness);
        row.push((degraded ? degraded.sharpness.toFixed(0) : "-").padStart(8));
    }

    const dark = await readFrame(path, 0, 0.25);
    const darkCards = await detectCardsIn(dark, { maxCards: 1, workingSize: WORKING_SIZE });
    const darkExposure = darkCards.length > 0 ? exposureOf(await rectifyCardIn(dark, darkCards[0].quad, 0)) : null;
    row.push((darkExposure ? darkExposure.mean.toFixed(0) : "-").padStart(8));

    process.stdout.write(
        `${label.file.padEnd(18)} ${row.join(" ")}   ${original.areaFraction.toFixed(2)}    ${original.guidedArea.toFixed(2)}  ${original.symmetry.toFixed(2)}  ${original.exposure.mean.toFixed(0).padStart(4)}  ${(original.exposure.clipped * 100).toFixed(1).padStart(4)}%\n`,
    );
}

/**
 * The value below which a share of the list lies
 *
 * @param values
 * @param share 0 to 1
 * @returns the quantile
 */
function quantile(values: number[], share: number): number {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

process.stdout.write(`\n${undetected} ohne Detektion.\n`);
process.stdout.write(
    `scharf:  min ${quantile(sharpValues, 0).toFixed(0)}  median ${quantile(sharpValues, 0.5).toFixed(0)}  max ${quantile(sharpValues, 1).toFixed(0)}\n`,
);
for (const [position, sigma] of BLURS.entries()) {
    const values = blurredValues[position];
    process.stdout.write(
        `blur ${sigma}:  min ${quantile(values, 0).toFixed(0)}  median ${quantile(values, 0.5).toFixed(0)}  max ${quantile(values, 1).toFixed(0)}\n`,
    );
}

// Every photograph is recognisable, so any refusal here is a frame lost.
const refused = (name: string, count: number) =>
    process.stdout.write(`${name.padEnd(18)} refuses ${count} of ${sharpValues.length}\n`);
process.stdout.write("\nAgainst the limits the gate ships with:\n");
refused("minArea", guidedAreas.filter((value) => value < QUALITY_LIMITS.minArea).length);
refused("minSymmetry", symmetries.filter((value) => value < QUALITY_LIMITS.minSymmetry).length);
refused("minSharpness", sharpValues.filter((value) => value < QUALITY_LIMITS.minSharpness).length);
refused("maxClipped", clips.filter((value) => value > QUALITY_LIMITS.maxClipped).length);
