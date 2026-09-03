// scripts/build-ocr-corpus.ts
import { createReadStream } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// src/scanner/hough-quads.ts
var PARALLEL_TOLERANCE = 30 * Math.PI / 180;
var PERPENDICULAR_MINIMUM = 45 * Math.PI / 180;

// src/scanner/card-detect.ts
var CARD_ASPECT = 63 / 88;
var ASSUMED_FOCAL_FRACTION = 1 / 1.4;
var RECTIFIED_WIDTH = 488;
var RECTIFIED_HEIGHT = 680;

// src/scanner/ocr.ts
var TITLE = { left: 0.06, right: 0.72, top: 0.035, bottom: 0.115 };
function titleStrip(card, upsideDown) {
  const left = Math.round(TITLE.left * card.width);
  const right = Math.round(TITLE.right * card.width);
  const top = Math.round(TITLE.top * card.height);
  const bottom = Math.round(TITLE.bottom * card.height);
  const width = right - left;
  const height = bottom - top;
  const out = {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height
  };
  for (let y = 0; y < height; y += 1) {
    const row = top + y;
    const sourceY = upsideDown ? card.height - 1 - row : row;
    for (let x = 0; x < width; x += 1) {
      const column = left + x;
      const sourceX = upsideDown ? card.width - 1 - column : column;
      const from = (sourceY * card.width + sourceX) * 4;
      const to = (y * width + x) * 4;
      const grey = (card.data[from] * 299 + card.data[from + 1] * 587 + card.data[from + 2] * 114) / 1e3;
      out.data[to] = grey;
      out.data[to + 1] = grey;
      out.data[to + 2] = grey;
      out.data[to + 3] = 255;
    }
  }
  return out;
}
var TITLE_REGION = { ...TITLE, width: RECTIFIED_WIDTH, height: RECTIFIED_HEIGHT };

// scripts/build-ocr-corpus.ts
var here = dirname(fileURLToPath(import.meta.url));
var cacheDir = join(here, "..", ".cache", "scryfall");
function option(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
}
var wanted = Number(option("--count", "20000"));
var language = option("--lang", "en");
var outDir = option("--out", join(here, "..", ".cache", "ocr-train", "data", language));
var facesFile = option("--faces", language === "en" ? "faces.jsonl" : `faces-${language}.jsonl`);
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
async function printedNames() {
  const { createGunzip } = await import("node:zlib");
  const names = /* @__PURE__ */ new Map();
  const stream = createReadStream(join(cacheDir, "default-cards.jsonl.gz")).pipe(createGunzip());
  const lines2 = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines2) {
    if (!line) continue;
    const card = JSON.parse(line);
    if (card.printed_name) names.set(card.id, card.printed_name);
  }
  return names;
}
var printed = await printedNames();
process.stderr.write(`${printed.size} Drucke mit abweichendem aufgedrucktem Namen
`);
var faces = [];
var lines = createInterface({ input: createReadStream(join(cacheDir, facesFile)), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line) continue;
  const face = JSON.parse(line);
  if (face.face !== 0 || face.lang !== language) continue;
  faces.push(face);
}
process.stderr.write(`${faces.length} Karten in "${language}"
`);
var stride = Math.max(1, Math.floor(faces.length / wanted));
var written = 0;
var skipped = 0;
for (let index = 0; index < faces.length && written < wanted; index += stride) {
  const face = faces[index];
  const truth = (face.printedName ?? printed.get(face.id) ?? face.name).split(" //")[0].trim();
  if (!truth || truth.length > 30) {
    skipped += 1;
    continue;
  }
  try {
    const decoded = await sharp(join(cacheDir, face.image)).resize({ width: RECTIFIED_WIDTH, height: RECTIFIED_HEIGHT, fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const card = {
      data: new Uint8ClampedArray(decoded.data),
      width: decoded.info.width,
      height: decoded.info.height
    };
    const strip = titleStrip(card, false);
    const stem = join(outDir, `${face.id}`);
    await sharp(Buffer.from(strip.data), {
      raw: { width: strip.width, height: strip.height, channels: 4 }
    }).removeAlpha().png().toFile(`${stem}.png`);
    await writeFile(`${stem}.gt.txt`, `${truth}
`, "utf8");
    written += 1;
  } catch {
    skipped += 1;
  }
  if (written % 1e3 === 0) process.stderr.write(`\r${written} geschrieben, ${skipped} \xFCbersprungen`);
}
process.stderr.write(`
${written} Paare in ${outDir}, ${skipped} \xFCbersprungen
`);
//! Lazy loader for the OpenCV.js runtime.
//!
//! The runtime is one 13 MB module (3.7 MB gzipped, WASM embedded), so it is imported
//! dynamically and only when a scan actually starts. `loadOpenCv` dedupes concurrent callers
//! and caches the resolved namespace, which makes it safe to call on every frame.
//! Builds card quads from straight line segments instead of from closed contours.
//! Contour detection needs the card's outline to close. On the photos that matter it often does
//! not: a card lying on a stack has its bottom edge swallowed by the card below, and a sleeved
//! card on a busy background can lose its outer boundary almost entirely. A line does not have
//! to close, so `houghQuads` still recovers the card from three clean edges and a fragment.
//! The decisive signal here is not the intersection geometry, which is cheap to satisfy by
//! accident, but {@link edgeSupport}: how much of each proposed side is actually covered by
//! detected segments. Four lines that merely happen to cross in a card-shaped way score near
//! zero on it.
//! Finds Magic cards in a camera frame and rectifies them into the canonical reference frame.
//! Everything downstream of this module assumes a card that has been perspective-corrected to
//! exactly the geometry of a Scryfall `normal` scan. That is what makes fixed-position crops
//! (set symbol, collector line, title bar) meaningful and what lets a camera photo and a
//! reference image be compared at all.
//! The 180° ambiguity is deliberately not resolved here: a card photographed upside down
//! produces a valid quad whose "top" edge is the bottom of the card. `rectifyCard` therefore
//! takes the orientation as a parameter and the matching stage scores both.
//! The functions taking an {@link RgbaImage} are the real implementation and are free of DOM
//! types, which is what lets the Node harness in test/ exercise the same code the app runs.
//! Reads the card's name off its title bar.
//! The embedding is the scanner's main sense and it has one blind spot that no tuning closes: a
//! foil under a lamp, behind a toploader. Measured on one such card, the correct printing sat at
//! rank 1224 with a cosine of 0.336 while unrelated cards scored 0.64, and neither white balance
//! nor a deeper shortlist moved it. The name, meanwhile, was perfectly legible.
//! So this is not a refinement of the visual match, it is a second, independent way of knowing
//! what the card is, and the two fail at different things. Text is unreadable when the card is
//! small or moving, which is exactly when the picture is still fine; the picture fails on glare
//! and foiling, which leaves the text alone.
//! Only the title bar is read, not the whole card. It is a single line of large type in a known
//! place, which is the one job OCR does quickly and well: 91 ms for a strip against well over a
//! second for one model run.
//! Cuts title strips out of the reference scans and pairs them with the name printed on them.
//! Tesseract's stock English model was never shown the typefaces these cards are set in, and on
//! flawless reference scans it reads 91 names out of 200. The catalogue is also the cure: every
//! reference image is a photograph of a card whose printed name we know exactly, which is a
//! labelled sample of precisely the thing that needs learning.
//! `printed_name` rather than `name` on purpose. A Japanese printing carries its English name in
//! the metadata and 暴虐の覇王アスマディ on the card, and it is the card that has to be read.
//! Output is the layout tesstrain expects: `<stem>.png` beside `<stem>.gt.txt`, one line each.
//! Usage: node scripts/build-ocr-corpus.mjs [--count 20000] [--lang en] [--faces faces.jsonl]
//!            [--out .cache/ocr-train/data]
