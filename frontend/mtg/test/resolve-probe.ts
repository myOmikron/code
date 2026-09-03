//! Asks the name matcher what it makes of a reading, and why.
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");
const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const index = createEmbeddingIndex({
    manifest,
    projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
    vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
    cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
});

for (const reading of process.argv.slice(2)) {
    process.stdout.write(`"${reading}" -> "${index.resolveName(reading)}"\n`);
}
