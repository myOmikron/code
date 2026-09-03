//! Renders what detection actually hands to the recognition stage, for eyeballing.
//!
//! One image per photo: the frame with the detected outline drawn on it next to the rectified
//! card that comes out of it. Numbers say how often recognition failed; this says why, and it is
//! the fastest way for a human to spot that the pipeline is looking at the wrong rectangle.
//!
//! Usage: node test/render-extracted.mjs <photoDir> [outputDir]
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
    detectCardsIn,
    RECTIFIED_HEIGHT,
    rectangleScore,
    rectifyCardIn,
    shrinkQuad,
} from "../src/scanner/card-detect";
import { sharpness } from "../src/scanner/image-quality";
import type { CardQuad, RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const [photoDir, outputArgument] = process.argv.slice(2);
const outputDir = outputArgument ?? join(here, "detect-output", "extrahiert");

/** Width the source frame is shown at in the side-by-side. */
const PREVIEW_WIDTH = 460;
/** Trim used for the second crop, matching the pipeline's sleeve allowance. */
const SLEEVE_TRIM = 0.04;

async function readImage(path: string, width?: number): Promise<RgbaImage> {
    const pipeline = sharp(path).rotate();
    const { data, info } = await (width ? pipeline.resize({ width }) : pipeline)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * Encodes a rectified card as a JPEG buffer
 *
 * @param image
 * @returns
 */
function encode(image: RgbaImage): Promise<Buffer> {
    return sharp(Buffer.from(image.data), {
        raw: { width: image.width, height: image.height, channels: 4 },
    })
        .jpeg({ quality: 90 })
        .toBuffer();
}

/**
 * Draws the detected outline over a downscaled copy of the source frame
 *
 * @param path
 * @param size dimensions after EXIF rotation
 * @param quad
 * @returns a JPEG buffer
 */
async function overlay(path: string, size: { width: number; height: number }, quad: CardQuad | null): Promise<Buffer> {
    const factor = PREVIEW_WIDTH / size.width;
    const height = Math.round(size.height * factor);
    const base = sharp(path).rotate().resize({ width: PREVIEW_WIDTH });
    if (!quad) return base.jpeg({ quality: 82 }).toBuffer();

    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
        .map((point) => `${(point.x * factor).toFixed(1)},${(point.y * factor).toFixed(1)}`)
        .join(" ");
    const svg = Buffer.from(
        `<svg width="${PREVIEW_WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
            `<polygon points="${points}" fill="none" stroke="#d5fe52" stroke-width="3"/>` +
            `<circle cx="${(quad.topLeft.x * factor).toFixed(1)}" cy="${(quad.topLeft.y * factor).toFixed(1)}" ` +
            `r="6" fill="#ff9d54"/></svg>`,
    );
    return base
        .composite([{ input: svg, top: 0, left: 0 }])
        .jpeg({ quality: 82 })
        .toBuffer();
}

async function main(): Promise<void> {
    if (!photoDir) throw new Error("Aufruf: render-extracted.mjs <fotoOrdner> [ausgabeOrdner]");
    await mkdir(outputDir, { recursive: true });

    const files = (await readdir(photoDir))
        .filter((file) => [".jpg", ".jpeg", ".png"].includes(extname(file).toLowerCase()))
        .sort();

    const report: { stem: string; area: number; rectangle: number; sharp: number; frame: number }[] = [];
    let detected = 0;
    for (const file of files) {
        const path = join(photoDir, file);
        const stem = basename(file, extname(file));
        const pixels = await readImage(path);
        const cards = await detectCardsIn(pixels);
        const quad = cards[0]?.quad ?? null;
        if (quad) detected += 1;

        const panels = [await overlay(path, pixels, quad)];
        let trimmed = null;
        if (quad) {
            panels.push(await encode(await rectifyCardIn(pixels, quad, 0)));
            trimmed = await rectifyCardIn(pixels, shrinkQuad(quad, SLEEVE_TRIM), 0);
            panels.push(await encode(trimmed));
        }

        const heights: number[] = [];
        for (const panel of panels) heights.push((await sharp(panel).metadata()).height ?? 0);
        const height = Math.max(...heights, RECTIFIED_HEIGHT);
        const scaled: { input: Buffer; left: number; top: number }[] = [];
        let left = 0;
        for (const panel of panels) {
            const resized = await sharp(panel)
                .resize({ height, fit: "contain", background: "#111111" })
                .toBuffer();
            const width = (await sharp(resized).metadata()).width ?? 0;
            scaled.push({ input: resized, left, top: 0 });
            left += width + 8;
        }

        await sharp({ create: { width: left, height, channels: 3, background: "#111111" } })
            .composite(scaled)
            .jpeg({ quality: 86 })
            .toFile(join(outputDir, `${stem}-check.jpg`));

        const frameSharpness = await sharpness(await readImage(path, PREVIEW_WIDTH * 2));
        if (quad && trimmed) {
            report.push({
                stem,
                area: cards[0].areaFraction * 100,
                rectangle: rectangleScore(quad, pixels.width, pixels.height),
                sharp: await sharpness(trimmed),
                frame: frameSharpness,
            });
        } else {
            report.push({ stem, area: 0, rectangle: 0, sharp: 0, frame: frameSharpness });
        }
    }

    report.sort((a, b) => a.sharp - b.sharp);
    process.stdout.write(
        `${"datei".padEnd(24)} ${"fläche".padStart(7)} ${"rechteck".padStart(9)} ${"ausschnitt".padStart(11)} ${"foto".padStart(7)}\n`,
    );
    for (const row of report) {
        process.stdout.write(
            `${row.stem.padEnd(24)} ${row.area.toFixed(1).padStart(6)}% ${row.rectangle.toFixed(3).padStart(9)} ` +
                `${row.sharp.toFixed(0).padStart(11)} ${row.frame.toFixed(0).padStart(7)}\n`,
        );
    }
    process.stdout.write(`\n${detected}/${files.length} mit Detektion. Ausgabe: ${outputDir}\n`);
}

await main();
