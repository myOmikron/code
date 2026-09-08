// Fetches the embedding model into public/models/, so the scanner never contacts a CDN.
// Output is generated, like public/data, and is not committed.
//
// The ONNX runtime itself needs nothing here: vite emits its wasm as a hashed asset when the
// package is imported. Copying it into public/ instead would break the dev server, which
// refuses to serve module imports from there.
//
// Usage: node scripts/setup-scanner-assets.mjs
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const modelDir = join(root, "public", "models");


// The fp16 export of this model is broken: it fails graph initialisation on a fusion that
// refers to a tensor missing from its own graph. Full precision it is, until a smaller export
// is found that actually loads.
const MODEL_URL = "https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model.onnx";
const MODEL_FILE = "dinov2-small.onnx";

async function main() {
  await mkdir(modelDir, { recursive: true });
  const modelPath = join(modelDir, MODEL_FILE);
  const present = await stat(modelPath).catch(() => null);
  if (present) {
    process.stdout.write(`  ${MODEL_FILE.padEnd(40)} ${(present.size / 1e6).toFixed(1)} MB (vorhanden)\n`);
    return;
  }

  process.stdout.write(`  lade ${MODEL_FILE}\n`);
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Modell: HTTP ${response.status}`);
  await writeFile(modelPath, Buffer.from(await response.arrayBuffer()));
  const { size } = await stat(modelPath);
  process.stdout.write(`  ${MODEL_FILE.padEnd(40)} ${(size / 1e6).toFixed(1)} MB\n`);
}

await main();
