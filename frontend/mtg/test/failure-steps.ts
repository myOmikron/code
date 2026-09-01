//! Writes one folder per card the scanner gets wrong, holding every step it took.
//!
//! A list of wrong answers says what failed and never why. Detection can cut the wrong rectangle,
//! rectification can land the title band somewhere else, the reader can misread a legible strip,
//! or the name can be read correctly and match nothing. Those need different fixes, and telling
//! them apart from the outside is guesswork. Each folder holds the frame with the outline drawn
//! on it, the rectified card, the strip that was read, and a `schritte.txt` naming what each
//! stage produced.
//!
//! Usage: node test/failure-steps.mjs <labels.json> <imageDir> [--out test/fehlschlaege] [--all]
import { gunzipSync } from "node:zlib";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { detectCardsIn, rectifyCardIn, shrinkQuad } from "../src/scanner/card-detect";
import { createEmbeddingIndex, nameKey } from "../src/scanner/embedding-index";
import { titleStrip } from "../src/scanner/ocr";
import type { CardQuad, RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const [labelFile, imagesDir] = process.argv.slice(2).filter((value) => !value.startsWith("--"));
if (!labelFile || !imagesDir) throw new Error("Aufruf: failure-steps.mjs <labels.json> <bildOrdner>");
const outDir = option("--out", join(here, "fehlschlaege"));
const width = Number(option("--width", "1080"));
const langPath = option("--lang", join(here, "..", "public", "tesseract"));
const model = option("--model", "mtg");
const keepAll = process.argv.includes("--all");

const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});

const worker = await createWorker(model, 1, { langPath, gzip: true, cacheMethod: "none", logger: () => undefined });
await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',-. ",
    tessedit_pageseg_mode: "13" as never,
    user_defined_dpi: "300",
});

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

/**
 * Saves raw pixels as a PNG
 *
 * @param image
 * @param path
 */
async function save(image: RgbaImage, path: string): Promise<void> {
    await sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } })
        .png()
        .toFile(path);
}

/**
 * Draws the detected outline onto a copy of the frame, so the crop can be judged in context
 *
 * @param frame
 * @param quad
 * @returns png bytes
 */
async function outlined(frame: RgbaImage, quad: CardQuad | null): Promise<Buffer> {
    const image = sharp(Buffer.from(frame.data), {
        raw: { width: frame.width, height: frame.height, channels: 4 },
    });
    if (!quad) return image.png().toBuffer();
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
        .map((point) => `${point.x.toFixed(0)},${point.y.toFixed(0)}`)
        .join(" ");
    const overlay = Buffer.from(
        `<svg width="${frame.width}" height="${frame.height}">` +
            `<polygon points="${points}" fill="none" stroke="#00ff66" stroke-width="6"/></svg>`,
    );
    return image
        .composite([{ input: overlay }])
        .png()
        .toBuffer();
}

const labels: { file: string; name: string; set?: string; number?: string }[] = JSON.parse(
    await readFile(labelFile, "utf8"),
);

let written = 0;
const summary: string[] = [];

for (const label of labels) {
    const decoded = await sharp(join(imagesDir, label.file))
        .rotate()
        .resize({ width })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const frame: RgbaImage = {
        data: new Uint8ClampedArray(decoded.data),
        width: decoded.info.width,
        height: decoded.info.height,
    };

    const steps: string[] = [`Datei      ${label.file}`, `Erwartet   ${label.name}`];
    const cards = await detectCardsIn(frame, { maxCards: 1, workingSize: 420 });
    let reading = "";
    let resolved = "";
    let crop: RgbaImage | null = null;
    let strip: RgbaImage | null = null;

    if (cards.length === 0) {
        steps.push("1 Detektion  KEIN VIERECK GEFUNDEN");
    } else {
        steps.push(
            `1 Detektion  ${(cards[0].areaFraction * 100).toFixed(1)} % des Bildes, Güte ${cards[0].score.toFixed(3)}`,
        );
        // The same two trims the scanner tries, in the same order, so the folder shows what
        // actually happened rather than a simplified version of it.
        for (const inset of [0, 0.04]) {
            const quad = inset === 0 ? cards[0].quad : shrinkQuad(cards[0].quad, inset);
            const candidate = await rectifyCardIn(frame, quad, 0);
            const candidateStrip = titleStrip(candidate, false);
            const png = await sharp(Buffer.from(candidateStrip.data), {
                raw: { width: candidateStrip.width, height: candidateStrip.height, channels: 4 },
            })
                .png()
                .toBuffer();
            const attempt = (await worker.recognize(png)).data.text.replace(/\s+/g, " ").trim();
            const match = attempt ? index.resolveName(attempt) : "";
            steps.push(`2 Beschnitt  ${(inset * 100).toFixed(0)} %`);
            steps.push(`3 Lesung     "${attempt}"`);
            steps.push(`4 Zuordnung  ${match ? `"${match}"` : "kein Name gefunden"}`);
            if (!crop) {
                crop = candidate;
                strip = candidateStrip;
                reading = attempt;
            }
            if (match) {
                crop = candidate;
                strip = candidateStrip;
                reading = attempt;
                resolved = match;
                break;
            }
        }
        if (resolved) {
            const printings = index.countNamed(resolved);
            steps.push(`5 Drucke     ${printings} mit diesem Namen`);
        }
    }

    const right = resolved !== "" && resolved === nameKey(label.name);
    steps.push(`Ergebnis   ${right ? "RICHTIG" : "FALSCH"}`);
    summary.push(`${right ? "+" : "-"} ${label.file.padEnd(26)} ${label.name.slice(0, 30).padEnd(32)} "${reading}"`);

    if (right && !keepAll) continue;

    const folder = join(outDir, `${label.name.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40)}--${label.file}`);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "1-bild-mit-umriss.png"), await outlined(frame, cards[0]?.quad ?? null));
    if (crop) await save(crop, join(folder, "2-entzerrte-karte.png"));
    if (strip) await save(strip, join(folder, "3-titelstreifen.png"));
    await writeFile(join(folder, "schritte.txt"), `${steps.join("\n")}\n`, "utf8");
    written += 1;
}

await writeFile(join(outDir, "uebersicht.txt"), `${summary.join("\n")}\n`, "utf8");
process.stdout.write(
    `${written} Fehlschläge von ${labels.length} in ${outDir}\n` +
        `Je Ordner: das Bild mit Umriss, die entzerrte Karte, der gelesene Streifen, schritte.txt\n`,
);
await worker.terminate();
