// Copies the self-hosted Tesseract.js runtime assets into public/tesseract/ and downloads
// the English traineddata, so OCR runs fully offline (no CDN, PWA-cacheable). Runs before every
// `pnpm dev` (cheap once the assets exist); pass --force after bumping tesseract.js /
// tesseract.js-core. Output is generated (like public/data), not committed.
// Usage: node scripts/setup-ocr-assets.mjs [--force]
import { cp, lstat, mkdir, rm, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "public", "tesseract");
const force = process.argv.includes("--force");

// tessdata_fast English model, gzipped — matches tesseract.js v5's default langPath layout.
const TRAINEDDATA_URL = "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(path) {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });

  // 1. Worker script.
  await cp(join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"), join(outDir, "worker.min.js"));

  // 2. Core WASM package (whole directory; the loader picks the SIMD/LSTM variant at runtime).
  //    pnpm exposes the package itself as a symlink. Without dereference, fs.cp reproduces that
  //    link in public/; in Docker it points back to the source below /app and the next run then
  //    refuses to copy the package "into itself". Repair output created by an older run first.
  const coreSource = join(root, "node_modules", "tesseract.js-core");
  const coreTarget = join(outDir, "core");
  if (await isSymlink(coreTarget)) await rm(coreTarget);
  await cp(coreSource, coreTarget, { recursive: true, dereference: true });

  // 3. English traineddata — the only network fetch, skipped once it is there so the dev server
  //    starts offline and fast. A failed download must not keep `pnpm dev` from starting: the
  //    rest of the app works without OCR, only the live scanner's identity gate needs it.
  const target = join(outDir, "eng.traineddata.gz");
  if (force || !(await exists(target))) {
    try {
      const response = await fetch(TRAINEDDATA_URL);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      process.stderr.write(`WARNUNG: traineddata-Download fehlgeschlagen (${error?.message ?? error}) — OCR bleibt aus, bis ${TRAINEDDATA_URL} erreichbar ist.\n`);
      return;
    }
  }

  const size = (await stat(target)).size;
  process.stdout.write(`OCR-Assets bereit in ${outDir} (eng.traineddata.gz ${(size / 1024 / 1024).toFixed(2)} MiB)\n`);
}

await main();
