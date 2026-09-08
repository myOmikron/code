//! Reports which detection gate discards the quads, per photo.
//!
//! "No detection" is an outcome, not a diagnosis. Every gate in `detectCardsIn` already counts
//! what it rejected; this prints that tally next to the ground truth so a failure can be
//! attributed to one gate instead of guessed at from the photo.
//!
//! Usage: node test/gate-probe.mjs <labels.json> <imageDir>
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { detectCardsIn } from "../src/scanner/card-detect";
import type { RgbaImage } from "../src/scanner/card-detect";

const [labelFile, imagesDir] = process.argv.slice(2);
if (!labelFile || !imagesDir) throw new Error("Aufruf: gate-probe.mjs <labels.json> <bildOrdner>");

const labels: { file: string; name: string }[] = JSON.parse(await readFile(labelFile, "utf8"));

/**
 * Decodes a photo into RGBA, honouring EXIF rotation
 *
 * @param path
 * @returns the pixels
 */
async function readImage(path: string): Promise<RgbaImage> {
    const { data, info } = await sharp(path).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

const totals: Record<string, number> = {};
let failures = 0;

for (const label of labels) {
    const pixels = await readImage(join(imagesDir, label.file));
    let counts: Record<string, number> = {};
    const cards = await detectCardsIn(pixels, { onRejects: (r) => (counts = r) });

    const interesting = Object.entries(counts)
        .filter(([gate, count]) => count > 0 && gate !== "klein" && gate !== "keinQuad")
        .sort((a, b) => b[1] - a[1])
        .map(([gate, count]) => `${gate} ${count}`)
        .join("  ");

    if (cards.length === 0) {
        failures += 1;
        for (const [gate, count] of Object.entries(counts)) totals[gate] = (totals[gate] ?? 0) + count;
    }
    const mark = cards.length === 0 ? "KEINE" : `${cards.length}x ${cards[0].areaFraction.toFixed(3)}`;
    process.stdout.write(`${label.file}  ${mark.padEnd(12)} ${interesting}\n`);
}

process.stdout.write(`\n${failures} ohne Detektion. Tore über die Fehlschläge:\n`);
for (const [gate, count] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${gate.padEnd(18)} ${count}\n`);
}
