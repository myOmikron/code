// Fetches the embedding models into public/models/, so the scanner never contacts a CDN.
// Output is generated, like public/data, and is not committed.
//
// The ONNX runtime itself needs nothing here: vite emits its wasm as a hashed asset when the
// package is imported. Copying it into public/ instead would break the dev server, which
// refuses to serve module imports from there.
//
// Usage: node scripts/setup-scanner-assets.mjs
import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const modelDir = join(root, "public", "models");

// The fp16 export of DINOv2 is broken: it fails graph initialisation on a fusion that refers to a
// tensor missing from its own graph. Full precision it is, until a smaller export is found that
// actually loads.
//
// dhv-embed is the second model the scanner can be switched to (see EMBEDDING_MODELS in
// src/scanner/embedding-models.ts), pinned to one revision and checked against its hash. The
// browser only fetches it on a device switched to it.
const DHV_REVISION = "653d88d94b2beb31a7894561e7c6b26f589a3861";
const MODELS = [
  {
    file: "dinov2-small.onnx",
    url: "https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model.onnx",
  },
  {
    file: "mtg_embed_fp32.onnx",
    url: `https://huggingface.co/dhvazquez/mtg_card_identification_embeddings/resolve/${DHV_REVISION}/20260521-044732/onnx/mtg_embed_fp32.onnx`,
    sha256: "fa092cdc8a25b0f3b80ee0ec0580fc9b4e0dc03bb49f9b7ffa43b83b88672ed2",
  },
];

async function fetchModel({ file, url, sha256 }) {
  const modelPath = join(modelDir, file);
  const present = await stat(modelPath).catch(() => null);
  if (present) {
    process.stdout.write(`  ${file.padEnd(40)} ${(present.size / 1e6).toFixed(1)} MB (vorhanden)\n`);
    return;
  }

  process.stdout.write(`  lade ${file}\n`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (sha256) {
    const actual = createHash("sha256").update(body).digest("hex");
    if (actual !== sha256) throw new Error(`${file}: sha256 ${actual}, erwartet ${sha256}`);
  }
  await writeFile(modelPath, body);
  process.stdout.write(`  ${file.padEnd(40)} ${(body.length / 1e6).toFixed(1)} MB\n`);
}

async function main() {
  await mkdir(modelDir, { recursive: true });
  for (const model of MODELS) await fetchModel(model);
}

await main();
