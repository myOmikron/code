//! Runs card detection and rectification over the labeled dataset outside the browser.
//!
//! The detection stage has no DOM dependency, so it can be exercised straight from Node against
//! the real photos. For every input it reports the detected quad and writes the rectified card
//! next to it, which is the only way to tell a geometrically correct warp from a plausible but
//! shifted one by eye.
//!
//! Usage: node test/detect-harness.mjs [glob-free directory] (bundle it with esbuild first)
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectCardsIn, rectifyCardIn, RECTIFIED_HEIGHT, RECTIFIED_WIDTH } from "../src/scanner/card-detect";
import { cardLikeness } from "../src/scanner/card-likeness";
import type { CardQuad, RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, "detect-output");

/**
 * Decodes an image file into raw RGBA
 *
 * @param path
 * @returns
 */
async function readImage(path: string): Promise<RgbaImage> {
    const { data, info } = await sharp(path)
        .rotate()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * Renders the detected outline onto the source frame so a wrong quad is visible at a glance
 *
 * @param path
 * @param quad
 * @param size dimensions after EXIF rotation, which is what the quad refers to
 * @param target
 */
async function writeOverlay(
    path: string,
    quad: CardQuad,
    size: { width: number; height: number },
    target: string,
): Promise<void> {
    const previewWidth = 640;
    const factor = previewWidth / size.width;
    const previewHeight = Math.round(size.height * factor);
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
        .map((point) => `${(point.x * factor).toFixed(1)},${(point.y * factor).toFixed(1)}`)
        .join(" ");
    const svg = Buffer.from(
        `<svg width="${previewWidth}" height="${previewHeight}" xmlns="http://www.w3.org/2000/svg">` +
            `<polygon points="${points}" fill="none" stroke="#d5fe52" stroke-width="3"/>` +
            `<circle cx="${(quad.topLeft.x * factor).toFixed(1)}" cy="${(quad.topLeft.y * factor).toFixed(1)}" ` +
            `r="7" fill="#ff9d54"/>` +
            `</svg>`,
    );
    await sharp(path)
        .rotate()
        .resize({ width: previewWidth })
        .composite([{ input: svg, top: 0, left: 0 }])
        .jpeg({ quality: 82 })
        .toFile(target);
}

async function main(): Promise<void> {
    const directories = process.argv[2] ? [process.argv[2]] : [join(here, "dataset", "images"), join(here, "fixtures")];
    await mkdir(outputDir, { recursive: true });

    let found = 0;
    let total = 0;
    for (const directory of directories) {
        const files = (await readdir(directory).catch(() => [])).filter((file) =>
            [".jpg", ".jpeg", ".png"].includes(extname(file).toLowerCase()),
        );
        for (const file of files) {
            total += 1;
            const path = join(directory, file);
            const stem = basename(file, extname(file));
            const started = Date.now();
            const pixels = await readImage(path);
            const cards = await detectCardsIn(pixels);
            const elapsed = Date.now() - started;

            if (cards.length === 0) {
                process.stdout.write(`${stem.padEnd(34)} keine Karte erkannt  (${pixels.width}×${pixels.height})\n`);
                continue;
            }
            found += 1;

            const considered = cards.slice(0, 3);
            const scored = [];
            for (const card of considered) {
                const rectified = await rectifyCardIn(pixels, card.quad);
                scored.push({ card, rectified, likeness: cardLikeness(rectified) });
            }
            const chosen = scored[0];
            const best = chosen.card;

            process.stdout.write(
                `${stem.padEnd(31)} ${String(cards.length).padStart(2)}q  ` +
                    `likeness ${scored.map((entry) => entry.likeness.toFixed(2)).join("/").padEnd(14)} ` +
                    `fläche ${(best.areaFraction * 100).toFixed(1).padStart(5)}%  ${elapsed} ms\n`,
            );

            await sharp(Buffer.from(chosen.rectified.data), {
                raw: { width: RECTIFIED_WIDTH, height: RECTIFIED_HEIGHT, channels: 4 },
            })
                .jpeg({ quality: 92 })
                .toFile(join(outputDir, `${stem}-rectified.jpg`));
            await writeOverlay(path, best.quad, pixels, join(outputDir, `${stem}-overlay.jpg`));
        }
    }
    process.stdout.write(`\n${found}/${total} Bilder mit Detektion. Ausgabe: ${outputDir}\n`);
}

await main();
