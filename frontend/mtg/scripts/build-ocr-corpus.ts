//! Cuts title strips out of the reference scans and pairs them with the name printed on them.
//!
//! Tesseract's stock English model was never shown the typefaces these cards are set in, and on
//! flawless reference scans it reads 91 names out of 200. The catalogue is also the cure: every
//! reference image is a photograph of a card whose printed name we know exactly, which is a
//! labelled sample of precisely the thing that needs learning.
//!
//! `printed_name` rather than `name` on purpose. A Japanese printing carries its English name in
//! the metadata and 暴虐の覇王アスマディ on the card, and it is the card that has to be read.
//!
//! Output is the layout tesstrain expects: `<stem>.png` beside `<stem>.gt.txt`, one line each.
//!
//! Usage: node scripts/build-ocr-corpus.mjs [--count 20000] [--lang en] [--faces faces.jsonl]
//!            [--out .cache/ocr-train/data]
import { createReadStream } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { RECTIFIED_HEIGHT, RECTIFIED_WIDTH } from "../src/scanner/card-detect";
import { titleStrip } from "../src/scanner/ocr";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const wanted = Number(option("--count", "20000"));
const language = option("--lang", "en");
const outDir = option("--out", join(here, "..", ".cache", "ocr-train", "data", language));
// Languages other than English come from their own catalogue, written by the image fetcher.
const facesFile = option("--faces", language === "en" ? "faces.jsonl" : `faces-${language}.jsonl`);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

/**
 * Reads the printed name of every printing, keyed by scryfall id.
 *
 * `faces.jsonl` carries the English name only, so the printed one comes from the bulk file the
 * faces were derived from.
 *
 * @returns printed names by id
 */
async function printedNames(): Promise<Map<string, string>> {
    const { createGunzip } = await import("node:zlib");
    const names = new Map<string, string>();
    const stream = createReadStream(join(cacheDir, "default-cards.jsonl.gz")).pipe(createGunzip());
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of lines) {
        if (!line) continue;
        const card = JSON.parse(line);
        if (card.printed_name) names.set(card.id, card.printed_name);
    }
    return names;
}

const printed = await printedNames();
process.stderr.write(`${printed.size} Drucke mit abweichendem aufgedrucktem Namen\n`);

type Face = { id: string; name: string; printedName?: string; lang: string; image: string; face: number };
const faces: Face[] = [];
const lines = createInterface({ input: createReadStream(join(cacheDir, facesFile)), crlfDelay: Infinity });
for await (const line of lines) {
    if (!line) continue;
    const face: Face = JSON.parse(line);
    // Only the front: the back of a double-faced card has its own title, but the metadata's name
    // is the front's, so the pairing would be a lie.
    if (face.face !== 0 || face.lang !== language) continue;
    faces.push(face);
}
process.stderr.write(`${faces.length} Karten in "${language}"\n`);

const stride = Math.max(1, Math.floor(faces.length / wanted));
let written = 0;
let skipped = 0;

for (let index = 0; index < faces.length && written < wanted; index += stride) {
    const face = faces[index];
    // What the card actually says: the fetcher records it, and for English the bulk file is
    // consulted for the handful of printings whose printed name differs from the metadata one.
    const truth = (face.printedName ?? printed.get(face.id) ?? face.name).split(" //")[0].trim();
    // A name that will not survive a round trip through the strip is not a label. Long ones run
    // past the right edge of the crop, and the reading would be marked wrong for being right.
    if (!truth || truth.length > 30) {
        skipped += 1;
        continue;
    }

    try {
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
        const stem = join(outDir, `${face.id}`);
        await sharp(Buffer.from(strip.data), {
            raw: { width: strip.width, height: strip.height, channels: 4 },
        })
            .removeAlpha()
            .png()
            .toFile(`${stem}.png`);
        await writeFile(`${stem}.gt.txt`, `${truth}\n`, "utf8");
        written += 1;
    } catch {
        skipped += 1;
    }

    if (written % 1000 === 0) process.stderr.write(`\r${written} geschrieben, ${skipped} übersprungen`);
}

process.stderr.write(`\n${written} Paare in ${outDir}, ${skipped} übersprungen\n`);
