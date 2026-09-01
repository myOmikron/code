// Copies the self-hosted Tesseract.js runtime assets into public/tesseract/ and downloads
// the English traineddata, so OCR runs fully offline (no CDN, PWA-cacheable). Re-run after
// bumping tesseract.js / tesseract.js-core. Output is generated (like public/data), not
// committed. Usage: node scripts/setup-ocr-assets.mjs
import { cp, mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "public", "tesseract");

// tessdata_fast English model, gzipped — matches tesseract.js v5's default langPath layout.
const TRAINEDDATA_URL = "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz";

const exists = (path) => stat(path).then(() => true).catch(() => false);

async function main() {
  await mkdir(outDir, { recursive: true });

  const target = join(outDir, "eng.traineddata.gz");
  const core = join(outDir, "core", "tesseract-core.wasm");
  const worker = join(outDir, "worker.min.js");

  // The fine-tuned model is not downloaded: `pnpm run ocr:model` produces it from the reference
  // images, and the app falls back to stock English when it is absent.
  const trained = join(root, "public", "tesseract", "mtg.traineddata.gz");
  if (!(await exists(trained))) {
    process.stdout.write("  mtg.traineddata.gz fehlt — \"pnpm run ocr:model\" trainiert es (~1 h)\n");
  }

  // Idempotent, because `dev` and `build` run it every time. Checking a file inside core/ rather
  // than core/ itself: an interrupted copy leaves the directory behind and nothing in it.
  if ((await exists(target)) && (await exists(core)) && (await exists(worker))) {
    process.stdout.write(`OCR-Assets bereits in ${outDir}\n`);
    return;
  }

  // 1. Worker script.
  await cp(join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"), worker);

  // 2. Core WASM package (whole directory; the loader picks the SIMD/LSTM variant at runtime).
  //    Dereferenced: pnpm links packages into node_modules, and copying the link itself leaves
  //    a relative path that resolves to nothing from public/, which vite then fails to build.
  await cp(join(root, "node_modules", "tesseract.js-core"), join(outDir, "core"), {
    recursive: true,
    dereference: true,
  });

  // 3. English traineddata.
  const response = await fetch(TRAINEDDATA_URL);
  if (!response.ok) throw new Error(`traineddata download failed: ${response.status} ${TRAINEDDATA_URL}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));

  const size = (await stat(target)).size;
  process.stdout.write(`OCR-Assets bereit in ${outDir} (eng.traineddata.gz ${(size / 1024 / 1024).toFixed(2)} MiB)\n`);
}

await main();
