//! Reads the title off clean reference scans, to separate the font from the camera.
//!
//! Card names are set in one of two typefaces the catalogue uses consistently, and Tesseract's
//! stock English model was trained on neither. That would explain a poor read rate on its own,
//! and it points at a different fix than better crops do: a model fine-tuned on these titles.
//!
//! The catalogue is its own test set for that question. Every reference image comes with the name
//! printed on it, under perfect light, in focus, already rectangular. If the reading fails there,
//! the camera is not the problem.
//!
//! Usage: node test/ocr-reference.mjs [--count 60]
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { createEmbeddingIndex, nameKey } from "../src/scanner/embedding-index";
import { titleStrip } from "../src/scanner/ocr";
import { RECTIFIED_HEIGHT, RECTIFIED_WIDTH } from "../src/scanner/card-detect";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const count = Number(option("--count", "60"));
const indexDir = join(here, "..", "public", "data", "scan-index");
const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});
const langPath = option("--lang", join(here, "..", "public", "tesseract"));

// The printed name, not the metadata's. A Spanish Plains says "Llanura" and a Japanese card says
// 暴虐の覇王アスマディ, and scoring the reading against the English name marks a correct reading wrong.
const printed = new Map<string, string>();
{
    const { createGunzip } = await import("node:zlib");
    const bulk = createInterface({
        input: createReadStream(join(cacheDir, "default-cards.jsonl.gz")).pipe(createGunzip()),
        crlfDelay: Infinity,
    });
    for await (const line of bulk) {
        if (!line) continue;
        const card = JSON.parse(line);
        if (card.printed_name) printed.set(card.id, card.printed_name);
    }
}

type Face = { id: string; image: string; name: string; printedName?: string; layout: string; setType: string };
const faces: Face[] = [];
const lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
let row = 0;
// Skipping the rows the model was trained on: a score on those measures memory, not reading.
const offset = Number(option("--offset", "0"));
const stride = Math.max(1, Math.floor(Number(option("--stride-over", "111131")) / count));
for await (const line of lines) {
    if (!line || row < offset || row % stride !== 1 || faces.length >= count) {
        row += 1;
        continue;
    }
    const face: Face = JSON.parse(line);
    // Real cards only, when asked. A random draw from the whole catalogue is full of things
    // nobody scans out of a deck: token cards, art series prints, pencil-sketch showcases and
    // playtest cards, none of which carry a title bar where a card carries one. Scoring against
    // those measures the catalogue's variety, not the reader.
    if (face.lang !== option("--lang-filter", face.lang)) {
        row += 1;
        continue;
    }
    const ordinary =
        !["token", "double_faced_token", "art_series", "emblem"].includes(face.layout) &&
        !["token", "memorabilia", "minigame"].includes(face.setType);
    if (!process.argv.includes("--ordinary") || ordinary) faces.push(face);
    row += 1;
}

const worker = await createWorker(option("--model", "eng"), 1, {
    langPath,
    gzip: !process.argv.includes("--no-gzip"),
    cacheMethod: "none",
    logger: () => undefined,
});
await worker.setParameters({
    tessedit_char_whitelist: process.argv.includes("--no-whitelist")
        ? ""
        : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',-. ",
    tessedit_pageseg_mode: option("--psm", "7") as never,
    user_defined_dpi: option("--dpi", "300"),
});

let exact = 0;
let close = 0;
let elapsed = 0;

for (const face of faces) {
    const decoded = await sharp(join(cacheDir, face.image))
        .resize({ width: RECTIFIED_WIDTH, height: RECTIFIED_HEIGHT, fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const card: RgbaImage = {
        data: new Uint8ClampedArray(decoded.data),
        width: decoded.info.width,
        height: decoded.info.height,
    };
    const strip = titleStrip(card, false);
    const base = sharp(Buffer.from(strip.data), {
        raw: { width: strip.width, height: strip.height, channels: 4 },
    });
    // Old frames and every borderless card set the title in light type on a dark ground, which is
    // the opposite of what a recogniser assumes. Which way round it is can be read off the mean.
    let dark = 0;
    for (let i = 0; i < strip.data.length; i += 4) dark += strip.data[i];
    const inverted = dark / (strip.data.length / 4) < 128;
    const zoom = Number(option("--zoom", "1"));
    const prepared = process.argv.includes("--polarity") && inverted ? base.negate({ alpha: false }) : base;
    const png = await (
        zoom === 1 ? prepared : prepared.resize({ width: Math.round(strip.width * zoom), kernel: "lanczos3" })
    )
        .png()
        .toBuffer();

    const started = Date.now();
    const text = (await worker.recognize(png)).data.text.replace(/\s+/g, " ").trim();
    elapsed += Date.now() - started;

    // The catalogue carries the printed name for everything appended from `all_cards`; the
    // bulk lookup covers the older English rows where the two differ.
    const wanted = nameKey(face.printedName || printed.get(face.id) || face.name);
    if (nameKey(text) === wanted) exact += 1;
    else if (index.resolveName(text) === wanted) close += 1;
    else {
        process.stdout.write(`  - "${text}"  statt  "${face.name}"\n`);
        if (process.argv.includes("--dump")) {
            const dumpDir = option("--dump-dir", "/tmp/ocr-fails");
            await sharp(Buffer.from(strip.data), {
                raw: { width: strip.width, height: strip.height, channels: 4 },
            })
                .png()
                .toFile(`${dumpDir}/${face.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24)}.png`);
        }
    }
}

process.stdout.write(
    `\n${exact}/${faces.length} direkt gelesen, ${close} über Zuordnung gerettet, ${exact + close}/${faces.length} gesamt\n` +
        `${(elapsed / faces.length).toFixed(0)} ms pro Titel\n`,
);
await worker.terminate();
