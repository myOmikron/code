//! Measures the name-first path: detect, read the title, look the name up. No model at all.
//!
//! The question this answers is whether the embedding is needed in the common case. It costs
//! about a second per frame on a phone, and if the card's own name is legible often enough, that
//! second buys nothing: the name narrows 111k printings to a handful directly, and local features
//! decide among them. What matters is how often "often enough" is, and what the cheap half costs
//! when the expensive half is left out.
//!
//! Usage: node test/ocr-bench.mjs <labels.json> <imageDir> [--width 1080]
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { detectCardsIn, rectifyCardIn, shrinkQuad } from "../src/scanner/card-detect";
import { createEmbeddingIndex, nameKey } from "../src/scanner/embedding-index";
import { titleStrip } from "../src/scanner/ocr";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const [labelFile, imagesDir] = process.argv.slice(2).filter((value) => !value.startsWith("--"));
if (!labelFile || !imagesDir) throw new Error("Aufruf: ocr-bench.mjs <labels.json> <bildOrdner>");
const width = Number(option("--width", "1080"));
const langPath = option("--lang", join(here, "..", "public", "tesseract"));

const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});

const worker = await createWorker(option("--model", "mtg"), 1, {
    langPath,
    gzip: true,
    cacheMethod: "none",
    logger: () => undefined,
});
await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',-. ",
    tessedit_pageseg_mode: option("--psm", "13") as never,
    user_defined_dpi: option("--dpi", "300"),
});

/**
 * Encodes a strip as PNG, which is what the recogniser accepts
 *
 * @param strip
 * @returns png bytes
 */
async function toPng(strip: RgbaImage): Promise<Buffer> {
    return sharp(Buffer.from(strip.data), { raw: { width: strip.width, height: strip.height, channels: 4 } })
        .png()
        .toBuffer();
}

const labels: { file: string; name: string; set: string; number: string }[] = JSON.parse(
    await readFile(labelFile, "utf8"),
);

/**
 * Finds the card in a photo and returns a generous box around it, in source pixels.
 *
 * @param path the photo
 * @returns an extract region
 */
async function cardBox(path: string): Promise<{ left: number; top: number; width: number; height: number }> {
    const small = await sharp(path).rotate().resize({ width: 1080 }).ensureAlpha().raw().toBuffer({
        resolveWithObject: true,
    });
    const meta = await sharp(path).rotate().metadata();
    const factor = (meta.width ?? 1080) / small.info.width;
    const found = await detectCardsIn(
        { data: new Uint8ClampedArray(small.data), width: small.info.width, height: small.info.height },
        { maxCards: 1, workingSize: 420 },
    );
    if (!found.length) return { left: 0, top: 0, width: meta.width ?? 1, height: meta.height ?? 1 };
    const points = [found[0].quad.topLeft, found[0].quad.topRight, found[0].quad.bottomRight, found[0].quad.bottomLeft];
    const xs = points.map((point) => point.x * factor);
    const ys = points.map((point) => point.y * factor);
    const pad = 0.12 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const left = Math.max(0, Math.round(Math.min(...xs) - pad));
    const top = Math.max(0, Math.round(Math.min(...ys) - pad));
    return {
        left,
        top,
        width: Math.min((meta.width ?? 1) - left, Math.round(Math.max(...xs) - Math.min(...xs) + 2 * pad)),
        height: Math.min((meta.height ?? 1) - top, Math.round(Math.max(...ys) - Math.min(...ys) + 2 * pad)),
    };
}

let read = 0;
let known = 0;
let right = 0;
let detectMs = 0;
let ocrMs = 0;
let lookupMs = 0;

const fill = process.argv.includes("--fill");

for (const label of labels) {
    // Emulating how the scanner is meant to be used: the guide asks for the card to fill it, so
    // the camera frame is mostly card. These photographs are not that — the cards sit small and
    // off-centre — and reading a name off a card that occupies a tenth of the frame is a
    // different problem from the one the live scanner has. Cropping to the card first, then
    // resizing to a phone frame, measures the intended case rather than the photographed one.
    const source = sharp(join(imagesDir, label.file)).rotate();
    const framed = fill ? source.extract(await cardBox(join(imagesDir, label.file))) : source;
    const decoded = await framed.resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const frame: RgbaImage = {
        data: new Uint8ClampedArray(decoded.data),
        width: decoded.info.width,
        height: decoded.info.height,
    };

    let started = Date.now();
    const cards = await detectCardsIn(frame, { maxCards: 1, workingSize: 420 });
    detectMs += Date.now() - started;
    if (cards.length === 0) {
        process.stdout.write(`  - ${label.file}  keine Detektion\n`);
        continue;
    }

    const insets = process.argv.includes("--two-insets")
        ? [0, Number(option("--inset", "0.04"))]
        : [Number(option("--inset", "0.04"))];
    started = Date.now();
    let text = "";
    for (const inset of insets) {
        const quad = inset === 0 ? cards[0].quad : shrinkQuad(cards[0].quad, inset);
        const crop = await rectifyCardIn(frame, quad, 0);
        const upright = (await worker.recognize(await toPng(titleStrip(crop, false)))).data.text
            .replace(/\s+/g, " ")
            .trim();
        if (!text) text = upright;
        if (index.resolveName(upright)) {
            text = upright;
            break;
        }
        // The flipped pass only wins if it produces a name the index knows. Taking it whenever
        // the upright pass came back short is how "Jonuod NoA sainie" — rules text off the bottom
        // of the card, backwards — ended up being treated as a card name.
        const flipped = (await worker.recognize(await toPng(titleStrip(crop, true)))).data.text
            .replace(/\s+/g, " ")
            .trim();
        if (index.resolveName(flipped)) {
            text = flipped;
            break;
        }
    }
    ocrMs += Date.now() - started;
    if (text) read += 1;

    started = Date.now();
    const resolved = index.resolveName(text);
    const printings = resolved ? index.searchNamed(new Float32Array(manifest.dim), resolved, 8) : [];
    lookupMs += Date.now() - started;

    const hit = resolved !== "" && resolved === nameKey(label.name);
    if (printings.length) known += 1;
    if (hit) right += 1;
    process.stdout.write(`  ${hit ? "+" : "-"} ${label.file}  "${text}"  ${printings.length} Drucke\n`);
}

const n = labels.length;
process.stdout.write(
    `\n${read}/${n} etwas gelesen, ${known}/${n} Name im Index, ${right}/${n} Name richtig\n` +
        `detect ${(detectMs / n).toFixed(0)} · ocr ${(ocrMs / n).toFixed(0)} · lookup ${(lookupMs / n).toFixed(0)} ms\n`,
);
await worker.terminate();
