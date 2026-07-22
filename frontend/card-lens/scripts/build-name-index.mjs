// Builds public/data/all-card-index/names.json.gz: a map from normalized card name to the
// [setIndex, position] locations of its printings, aligned with the existing manifest/shards.
// Reads the already-built shards (no Scryfall download, no signature recompute), so it is
// cheap to regenerate. Run after the index is built: node scripts/build-name-index.mjs
import { createGunzip, gzipSync } from "node:zlib";
import { createReadStream } from "node:fs";
import { readFile, writeFile, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "all-card-index");

// Must match INDEX_VERSION/normalizeName in src/nameIndex.ts.
const NAME_INDEX_FORMAT = 1;

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonMaybeGz(path) {
  if (path.endsWith(".gz")) {
    const chunks = [];
    await new Promise((resolve, reject) => {
      createReadStream(path)
        .pipe(createGunzip())
        .on("data", (c) => chunks.push(c))
        .on("end", resolve)
        .on("error", reject);
    });
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const manifest = await readJsonMaybeGz(join(indexDir, "manifest.json"));
  const names = new Map(); // normName -> [[setIndex, position], ...]
  let cardCount = 0;

  for (let setIndex = 0; setIndex < manifest.sets.length; setIndex += 1) {
    const set = manifest.sets[setIndex];
    const shard = await readJsonMaybeGz(join(indexDir, set.file));
    shard.cards.forEach((card, position) => {
      const key = normalizeName(card.name);
      if (!key) return;
      const list = names.get(key) ?? [];
      list.push([setIndex, position]);
      names.set(key, list);
      cardCount += 1;
    });
    if ((setIndex + 1) % 100 === 0 || setIndex + 1 === manifest.sets.length) {
      process.stdout.write(`\r${setIndex + 1}/${manifest.sets.length} Sets`);
    }
  }
  process.stdout.write("\n");

  const payload = {
    formatVersion: NAME_INDEX_FORMAT,
    indexVersion: manifest.indexVersion,
    uniqueNames: names.size,
    cardCount,
    // Compact: [normName, [[setIndex, position], ...]] entries.
    names: [...names.entries()],
  };

  const outPath = join(indexDir, "names.json.gz");
  const tmpPath = `${outPath}.tmp`;
  await writeFile(tmpPath, gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));
  await rename(tmpPath, outPath);
  const size = (await stat(outPath)).size;
  process.stdout.write(
    `names.json.gz: ${names.size} eindeutige Namen, ${cardCount} Printings (${(size / 1024 / 1024).toFixed(2)} MiB gz)\n`,
  );
}

await main();
