// Downloads the reference card images the new scanner index is built from.
//
// Pulls Scryfall's `default_cards` bulk file, keeps every paper printing, and fetches one
// image per card face into .cache/scryfall/images/. Alongside it writes faces.jsonl, one
// line per face with the metadata the index builder needs (printing identity, frame,
// artwork id, image path) so later stages never have to re-read the 74 MB bulk file.
//
// Resumable: a face whose file already exists on disk with a plausible size is skipped, so
// an interrupted run is continued by starting it again.
//
// Usage: node scripts/fetch-card-images.mjs [--size normal] [--rate 12] [--concurrency 6]
import { mkdir, open, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");
const imagesDir = join(cacheDir, "images");
const bulkPath = join(cacheDir, "default-cards.jsonl.gz");
const facesPath = join(cacheDir, "faces.jsonl");
const statePath = join(cacheDir, "fetch-state.json");

const USER_AGENT = "PlanariumIndexBuilder/0.1";
const MIN_IMAGE_BYTES = 2048;

function option(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
}

const imageSize = option("--size", "normal");
const requestsPerSecond = Number(option("--rate", "12"));
const concurrency = Number(option("--concurrency", "6"));

/**
 * Token bucket shared by all workers, so the whole run stays under the rate Scryfall asks for
 * no matter how many requests are in flight.
 */
function createRateLimiter(perSecond) {
  const interval = 1000 / perSecond;
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + interval;
    if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
  };
}

const throttle = createRateLimiter(requestsPerSecond);

async function fetchBulkUri() {
  const response = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`bulk-data: HTTP ${response.status}`);
  const { data } = await response.json();
  const entry = data.find((item) => item.type === "default_cards");
  if (!entry) throw new Error("default_cards fehlt in der bulk-data Liste");
  return { uri: entry.jsonl_download_uri, updatedAt: entry.updated_at };
}

async function ensureBulk() {
  const { uri, updatedAt } = await fetchBulkUri();
  const state = await readJson(statePath, {});
  const present = await stat(bulkPath).catch(() => null);
  if (present && state.bulkUpdatedAt === updatedAt) return updatedAt;

  process.stderr.write(`Lade Bulk-Datei (${updatedAt})\n`);
  const response = await fetch(uri, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`bulk download: HTTP ${response.status}`);
  const temporary = `${bulkPath}.tmp`;
  await writeFile(temporary, Buffer.from(await response.arrayBuffer()));
  await rename(temporary, bulkPath);
  await writeFile(statePath, JSON.stringify({ ...state, bulkUpdatedAt: updatedAt }, null, 2));
  return updatedAt;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Yields every paper card object of the bulk file without holding it all in memory.
 */
async function* readPaperCards() {
  const lines = createInterface({
    input: createReadStream(bulkPath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line) continue;
    const card = JSON.parse(line);
    if (card.games?.includes("paper")) yield card;
  }
}

/**
 * Flattens a card into its faces. Single-faced cards carry `image_uris` themselves; layouts
 * like transform and modal_dfc carry one per entry in `card_faces`. Split and adventure cards
 * are a single physical face and are treated as such.
 */
function facesOf(card) {
  const base = {
    id: card.id,
    oracleId: card.oracle_id ?? null,
    set: card.set,
    setName: card.set_name,
    setType: card.set_type,
    collectorNumber: card.collector_number,
    lang: card.lang,
    layout: card.layout,
    rarity: card.rarity,
    frame: card.frame,
    frameEffects: card.frame_effects ?? [],
    borderColor: card.border_color,
    fullArt: Boolean(card.full_art),
    textless: Boolean(card.textless),
    promo: Boolean(card.promo),
    promoTypes: card.promo_types ?? [],
    finishes: card.finishes ?? [],
    releasedAt: card.released_at,
    digital: Boolean(card.digital),
  };

  const display = (face) => ({
    manaCost: face.mana_cost ?? card.mana_cost ?? "",
    typeLine: face.type_line ?? card.type_line ?? "",
    colors: face.colors ?? card.colors ?? [],
  });

  if (card.image_uris?.[imageSize]) {
    return [
      {
        ...base,
        ...display(card),
        face: 0,
        name: card.name,
        illustrationId: card.illustration_id ?? null,
        artist: card.artist ?? null,
        url: card.image_uris[imageSize],
      },
    ];
  }

  return (card.card_faces ?? [])
    .map((face, index) => ({ face, index }))
    .filter(({ face }) => face.image_uris?.[imageSize])
    .map(({ face, index }) => ({
      ...base,
      ...display(face),
      face: index,
      name: face.name,
      illustrationId: face.illustration_id ?? null,
      artist: face.artist ?? null,
      url: face.image_uris[imageSize],
    }));
}

function pathFor(entry) {
  return join(imagesDir, entry.id.slice(0, 2), `${entry.id}_${entry.face}.jpg`);
}

async function alreadyFetched(path) {
  const info = await stat(path).catch(() => null);
  return Boolean(info && info.size >= MIN_IMAGE_BYTES);
}

async function download(entry, path) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await throttle();
    let response;
    try {
      response = await fetch(entry.url, { headers: { "User-Agent": USER_AGENT } });
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after")) * 1000;
      await new Promise((resolve) => setTimeout(resolve, retryAfter || 2000 * 2 ** attempt));
      continue;
    }
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`${entry.id}: HTTP ${response.status}`);

    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength < MIN_IMAGE_BYTES) throw new Error(`${entry.id}: Bild zu klein`);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, body);
    await rename(temporary, path);
    return true;
  }
  throw new Error(`${entry.id}: nach 5 Versuchen aufgegeben`);
}

async function main() {
  await mkdir(imagesDir, { recursive: true });
  const bulkUpdatedAt = await ensureBulk();

  process.stderr.write("Sammle Faces aus der Bulk-Datei\n");
  const entries = [];
  for await (const card of readPaperCards()) entries.push(...facesOf(card));
  process.stderr.write(`${entries.length.toLocaleString("de-DE")} Faces\n`);

  const faces = await open(facesPath, "w");
  const stream = faces.createWriteStream();
  for (const entry of entries) {
    const { url, ...rest } = entry;
    stream.write(`${JSON.stringify({ ...rest, image: pathFor(entry).slice(cacheDir.length + 1) })}\n`);
  }
  await new Promise((resolve) => stream.end(resolve));
  await faces.close();

  let done = 0;
  let fetched = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;
  const started = Date.now();
  const total = entries.length;
  let cursor = 0;

  const report = () => {
    const elapsed = (Date.now() - started) / 1000;
    const rate = fetched / Math.max(elapsed, 1);
    const left = rate > 0 ? Math.round((total - done) / rate) : 0;
    process.stderr.write(
      `\r${done}/${total}  neu ${fetched}  vorhanden ${skipped}  fehlend ${missing}  fehler ${failed}  ` +
        `${rate.toFixed(1)}/s  noch ~${Math.floor(left / 60)} min   `,
    );
  };

  async function worker() {
    while (cursor < total) {
      const entry = entries[cursor];
      cursor += 1;
      const path = pathFor(entry);
      try {
        if (await alreadyFetched(path)) skipped += 1;
        else if (await download(entry, path)) fetched += 1;
        else missing += 1;
      } catch (error) {
        failed += 1;
        process.stderr.write(`\n${error.message}\n`);
      }
      done += 1;
      if (done % 200 === 0) report();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  report();
  process.stderr.write("\n");

  await writeFile(
    statePath,
    JSON.stringify(
      {
        bulkUpdatedAt,
        imageSize,
        total,
        fetched,
        skipped,
        missing,
        failed,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.stderr.write(`Fertig. faces.jsonl: ${facesPath}\n`);
}

await main();
