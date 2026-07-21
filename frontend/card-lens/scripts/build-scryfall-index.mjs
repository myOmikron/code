import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import sharp from "sharp";

const SELECTED_INDEX_VERSION = "ltr-dsk-all-printings-v14-precomputed";
const ALL_INDEX_VERSION = "all-physical-default-cards-v14-precomputed";
const NORMALIZED_WIDTH = 252;
const NORMALIZED_HEIGHT = 352;
const CARD_ASPECT_RATIO = 63 / 88;
const DEFAULT_CONCURRENCY = 16;
const REQUEST_HEADERS = {
  Accept: "application/json;q=0.9,*/*;q=0.8",
  "User-Agent": "CardLens/0.1 local-index-builder",
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const setCodes = option("--sets", "ltr,dsk")
  .split(",")
  .map((setCode) => setCode.trim().toLowerCase())
  .filter(Boolean);
const concurrency = Number(option("--concurrency", String(DEFAULT_CONCURRENCY)));
const limit = Number(option("--limit", "0"));
const allSets = process.argv.includes("--all");
const imageDirectory = resolve(option("--image-dir", join(appDirectory, ".cache", "scryfall-images")));
const outputPath = resolve(option("--output", join(appDirectory, "public", "data", "reference-index.json")));
const outputDirectory = resolve(option("--output-dir", join(appDirectory, "public", "data", "all-card-index")));
const bulkDirectory = resolve(option("--bulk-dir", join(appDirectory, ".cache", "scryfall-bulk")));
const forceDownload = process.argv.includes("--force-download");

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function fetchWithRetry(url, init = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      throw new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(attempt * 400);
    }
  }
  throw new Error(`Download fehlgeschlagen: ${url}`, { cause: lastError });
}

function searchUrl(setCode) {
  const query = encodeURIComponent(`e:${setCode} game:paper`);
  return `https://api.scryfall.com/cards/search?q=${query}&unique=prints&order=set&dir=asc&include_extras=true&include_variations=true`;
}

async function fetchSet(setCode) {
  const cards = [];
  let nextPage = searchUrl(setCode);
  while (nextPage) {
    const response = await fetchWithRetry(nextPage, { headers: REQUEST_HEADERS });
    const page = await response.json();
    cards.push(...page.data);
    process.stdout.write(`\r${setCode.toUpperCase()}: ${cards.length}/${page.total_cards ?? cards.length} Metadaten`);
    nextPage = page.has_more ? page.next_page : undefined;
    if (nextPage) await wait(120);
  }
  process.stdout.write("\n");
  return cards;
}

async function defaultCardsBulkData() {
  const response = await fetchWithRetry("https://api.scryfall.com/bulk-data", {
    headers: REQUEST_HEADERS,
  });
  const payload = await response.json();
  const bulk = payload.data.find((entry) => entry.type === "default_cards");
  if (!bulk) throw new Error("Scryfall liefert keinen default_cards-Bulk-Datensatz.");
  return bulk;
}

async function downloadBulkData(bulk) {
  await mkdir(bulkDirectory, { recursive: true });
  const path = join(bulkDirectory, basename(new URL(bulk.download_uri).pathname));
  if (!forceDownload && (await exists(path))) {
    process.stdout.write(`Bulk-Daten aus Cache: ${path}\n`);
    return path;
  }
  const response = await fetchWithRetry(bulk.download_uri, {
    headers: REQUEST_HEADERS,
  });
  if (!response.body) throw new Error("Scryfall Bulk-Download enthält keinen Body.");
  const temporaryPath = `${path}.tmp`;
  let downloaded = 0;
  let lastReport = 0;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length;
      if (downloaded - lastReport >= 25 * 1024 * 1024) {
        lastReport = downloaded;
        process.stdout.write(`\rBulk-Daten: ${(downloaded / 1024 / 1024).toFixed(0)} MiB`);
      }
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(temporaryPath));
  await rename(temporaryPath, path);
  process.stdout.write(`\rBulk-Daten: ${(downloaded / 1024 / 1024).toFixed(0)} MiB geladen\n`);
  return path;
}

async function readAllPhysicalCards(bulkPath) {
  const sets = new Map();
  const cardStream = createReadStream(bulkPath).pipe(parser()).pipe(streamArray());
  let sourceCards = 0;
  let imageRecords = 0;
  for await (const { value: card } of cardStream) {
    sourceCards += 1;
    if (!card.games?.includes("paper")) continue;
    for (const record of mapCards(card)) {
      const setCode = record.setCode.toLowerCase();
      const group = sets.get(setCode) ?? { name: record.setName, cards: [] };
      group.cards.push(record);
      sets.set(setCode, group);
      imageRecords += 1;
      if (limit > 0 && imageRecords >= limit) break;
    }
    if (sourceCards % 5000 === 0) {
      process.stdout.write(`\rBulk-Daten gelesen: ${sourceCards} Karten · ${imageRecords} Bilder`);
    }
    if (limit > 0 && imageRecords >= limit) break;
  }
  cardStream.destroy();
  process.stdout.write(`\rBulk-Daten gelesen: ${sourceCards} Karten · ${imageRecords} Bilder\n`);
  return sets;
}

function imageUrl(imageUris) {
  return imageUris?.small ?? imageUris?.normal;
}

function mapCards(card) {
  const shared = {
    setName: card.set_name,
    setCode: card.set.toUpperCase(),
    collectorNumber: card.collector_number,
    priceEur: card.prices.eur ? Number(card.prices.eur) : null,
  };
  const directImage = imageUrl(card.image_uris);
  if (directImage) {
    return [{
      ...shared,
      id: card.id,
      name: card.name,
      manaCost: card.mana_cost ?? "",
      typeLine: card.type_line,
      colors: card.colors ?? [],
      imageUrl: directImage,
    }];
  }
  return (card.card_faces ?? []).flatMap((face, index) => {
    const faceImage = imageUrl(face.image_uris);
    return faceImage ? [{
      ...shared,
      id: `${card.id}-face-${index}`,
      name: face.name ?? card.name,
      manaCost: face.mana_cost ?? "",
      typeLine: face.type_line ?? card.type_line,
      colors: face.colors ?? card.colors ?? [],
      imageUrl: faceImage,
    }] : [];
  });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function cachedImage(card, redownload = false) {
  const setDirectory = join(imageDirectory, card.setCode.toLowerCase());
  const safeId = card.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const path = join(setDirectory, `${safeId}.jpg`);
  await mkdir(setDirectory, { recursive: true });
  if (!forceDownload && !redownload && (await exists(path))) {
    const buffer = await readFile(path);
    if (buffer.length >= 512) return { path, buffer, fromCache: true };
  }
  const response = await fetchWithRetry(card.imageUrl, {
    headers: { ...REQUEST_HEADERS, Accept: "image/avif,image/webp,image/jpeg,*/*" },
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 512) throw new Error(`Leeres oder unvollständiges Bild: ${card.imageUrl}`);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, buffer);
  await rename(temporaryPath, path);
  return { path, buffer, fromCache: false };
}

async function indexCard(card) {
  const image = await cachedImage(card);
  try {
    return { ...card, signature: await imageSignature(image.buffer) };
  } catch (error) {
    if (!image.fromCache) throw error;
    process.stdout.write(`\nDefektes Cache-Bild wird neu geladen: ${image.path}\n`);
    const replacement = await cachedImage(card, true);
    return { ...card, signature: await imageSignature(replacement.buffer) };
  }
}

function resizeRgb(input, sourceWidth, sourceHeight, targetWidth, targetHeight, region = undefined) {
  const crop = region ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const output = new Float32Array(targetWidth * targetHeight * 3);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = crop.y + ((y + 0.5) * crop.height) / targetHeight - 0.5;
    const top = Math.max(0, Math.min(sourceHeight - 1, Math.floor(sourceY)));
    const bottom = Math.max(0, Math.min(sourceHeight - 1, top + 1));
    const yWeight = Math.max(0, Math.min(1, sourceY - top));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = crop.x + ((x + 0.5) * crop.width) / targetWidth - 0.5;
      const left = Math.max(0, Math.min(sourceWidth - 1, Math.floor(sourceX)));
      const right = Math.max(0, Math.min(sourceWidth - 1, left + 1));
      const xWeight = Math.max(0, Math.min(1, sourceX - left));
      for (let channel = 0; channel < 3; channel += 1) {
        const topLeft = input[(top * sourceWidth + left) * 3 + channel];
        const topRight = input[(top * sourceWidth + right) * 3 + channel];
        const bottomLeft = input[(bottom * sourceWidth + left) * 3 + channel];
        const bottomRight = input[(bottom * sourceWidth + right) * 3 + channel];
        const topValue = topLeft + (topRight - topLeft) * xWeight;
        const bottomValue = bottomLeft + (bottomRight - bottomLeft) * xWeight;
        output[(y * targetWidth + x) * 3 + channel] = topValue + (bottomValue - topValue) * yWeight;
      }
    }
  }
  return output;
}

function grayscale(red, green, blue) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function bitsToHex(bits) {
  let value = 0n;
  for (const bit of bits) value = (value << 1n) | (bit ? 1n : 0n);
  return value.toString(16).padStart(Math.ceil(bits.length / 4), "0");
}

function lumaVector(grid) {
  const vector = [];
  for (let index = 0; index < grid.length; index += 3) {
    vector.push(grayscale(grid[index], grid[index + 1], grid[index + 2]) / 255);
  }
  return vector;
}

function differenceHash(normalized) {
  const grid = resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, 9, 8);
  const bits = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const offset = (y * 9 + x) * 3;
      const next = offset + 3;
      bits.push(
        grayscale(grid[offset], grid[offset + 1], grid[offset + 2]) >
          grayscale(grid[next], grid[next + 1], grid[next + 2]),
      );
    }
  }
  return bitsToHex(bits);
}

function averageHash(normalized) {
  const values = lumaVector(resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, 8, 8));
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return bitsToHex(values.map((value) => value >= average));
}

function artworkHash(normalized) {
  const grid = resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, 9, 8, {
    x: 0.06 * NORMALIZED_WIDTH,
    y: 0.04 * NORMALIZED_HEIGHT,
    width: 0.88 * NORMALIZED_WIDTH,
    height: 0.62 * NORMALIZED_HEIGHT,
  });
  const bits = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const offset = (y * 9 + x) * 3;
      const next = offset + 3;
      bits.push(
        grayscale(grid[offset], grid[offset + 1], grid[offset + 2]) >
          grayscale(grid[next], grid[next + 1], grid[next + 2]),
      );
    }
  }
  return bitsToHex(bits);
}

function artworkVector(normalized) {
  return lumaVector(
    resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, 20, 14, {
      x: 0.06 * NORMALIZED_WIDTH,
      y: 0.04 * NORMALIZED_HEIGHT,
      width: 0.88 * NORMALIZED_WIDTH,
      height: 0.62 * NORMALIZED_HEIGHT,
    }),
  );
}

function artworkEdgeVector(normalized) {
  const width = 32;
  const height = 24;
  const luma = lumaVector(
    resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, width, height, {
      x: 0.06 * NORMALIZED_WIDTH,
      y: 0.04 * NORMALIZED_HEIGHT,
      width: 0.88 * NORMALIZED_WIDTH,
      height: 0.62 * NORMALIZED_HEIGHT,
    }),
  );
  const edges = new Array(luma.length).fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = y * width + x;
      const horizontal = luma[offset + 1] - luma[offset - 1];
      const vertical = luma[offset + width] - luma[offset - width];
      edges[offset] = Math.sqrt(horizontal * horizontal + vertical * vertical) / Math.SQRT2;
    }
  }
  return edges;
}

function spatialColorVector(normalized) {
  const grid = resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, 12, 9, {
    x: 0.06 * NORMALIZED_WIDTH,
    y: 0.04 * NORMALIZED_HEIGHT,
    width: 0.88 * NORMALIZED_WIDTH,
    height: 0.62 * NORMALIZED_HEIGHT,
  });
  const colors = [];
  for (let index = 0; index < grid.length; index += 3) {
    const total = Math.max(1, grid[index] + grid[index + 1] + grid[index + 2]);
    colors.push(grid[index] / total, grid[index + 1] / total, grid[index + 2] / total);
  }
  return colors;
}

function titleVector(normalized) {
  const width = 40;
  const height = 8;
  const luma = lumaVector(
    resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, width, height, {
      x: 0.07 * NORMALIZED_WIDTH,
      y: 0.055 * NORMALIZED_HEIGHT,
      width: 0.86 * NORMALIZED_WIDTH,
      height: 0.1 * NORMALIZED_HEIGHT,
    }),
  );
  const edges = new Array(luma.length).fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = y * width + x;
      const horizontal = luma[offset + 1] - luma[offset - 1];
      const vertical = luma[offset + width] - luma[offset - width];
      edges[offset] = Math.sqrt(horizontal * horizontal + vertical * vertical) / Math.SQRT2;
    }
  }
  return edges;
}

function regionEdgeVector(normalized, region, width, height) {
  const luma = lumaVector(resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, width, height, region));
  const edges = new Array(luma.length).fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = y * width + x;
      const horizontal = luma[offset + 1] - luma[offset - 1];
      const vertical = luma[offset + width] - luma[offset - width];
      edges[offset] = Math.sqrt(horizontal * horizontal + vertical * vertical) / Math.SQRT2;
    }
  }
  return edges;
}

function chromaVector(normalized) {
  const grid = resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, 24, 32);
  const buckets = new Array(12).fill(0);
  let totalWeight = 0;
  let saturationTotal = 0;
  for (let index = 0; index < grid.length; index += 3) {
    const red = grid[index] / 255;
    const green = grid[index + 1] / 255;
    const blue = grid[index + 2] / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    const saturation = maximum === 0 ? 0 : delta / maximum;
    let hue = 0;
    if (delta > 0) {
      if (maximum === red) hue = ((green - blue) / delta + 6) % 6;
      else if (maximum === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      hue /= 6;
    }
    const weight = saturation * Math.sqrt(maximum);
    buckets[Math.min(11, Math.floor(hue * 12))] += weight;
    totalWeight += weight;
    saturationTotal += saturation;
  }
  return [...buckets.map((value) => value / Math.max(totalWeight, 0.001)), saturationTotal / 768];
}

function edgeVector(normalized) {
  const width = 24;
  const height = 34;
  const luma = lumaVector(resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, width, height));
  const edges = new Array(luma.length).fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = y * width + x;
      const horizontal = luma[offset + 1] - luma[offset - 1];
      const vertical = luma[offset + width] - luma[offset - width];
      edges[offset] = Math.sqrt(horizontal * horizontal + vertical * vertical) / Math.SQRT2;
    }
  }
  return edges;
}

function colorSignature(normalized) {
  const grid = resizeRgb(normalized, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, 16, 16);
  const buckets = new Array(12).fill(0);
  const totals = [0, 0, 0];
  for (let index = 0; index < grid.length; index += 3) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = grid[index + channel];
      totals[channel] += value;
      buckets[channel * 4 + Math.min(3, Math.floor(value / 64))] += 1;
    }
  }
  return {
    colorVector: buckets.map((value) => value / 256),
    dominantColor: totals.indexOf(Math.max(...totals)),
  };
}

function encodeVector(values) {
  return Buffer.from(values.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255))).toString("base64");
}

function compactSpatialVector(values) {
  return encodeVector(resizeRgb(Float32Array.from(values), 12, 9, 6, 5));
}

function compactEdgeVector(values) {
  const compact = [];
  for (let targetY = 0; targetY < 11; targetY += 1) {
    for (let targetX = 0; targetX < 8; targetX += 1) {
      const sourceX = Math.min(23, Math.floor(((targetX + 0.5) * 24) / 8));
      const sourceY = Math.min(33, Math.floor(((targetY + 0.5) * 34) / 11));
      compact.push(values[sourceY * 24 + sourceX]);
    }
  }
  return encodeVector(compact);
}

function compactTitleVector(values) {
  const compact = [];
  for (let targetY = 0; targetY < 4; targetY += 1) {
    for (let targetX = 0; targetX < 20; targetX += 1) {
      const sourceX = Math.min(39, Math.floor(((targetX + 0.5) * 40) / 20));
      const sourceY = Math.min(7, Math.floor(((targetY + 0.5) * 8) / 4));
      compact.push(values[sourceY * 40 + sourceX]);
    }
  }
  return encodeVector(compact);
}

function compactArtworkEdgeVector(values) {
  const compact = [];
  for (let targetY = 0; targetY < 12; targetY += 1) {
    for (let targetX = 0; targetX < 16; targetX += 1) {
      const sourceX = Math.min(31, Math.floor(((targetX + 0.5) * 32) / 16));
      const sourceY = Math.min(23, Math.floor(((targetY + 0.5) * 24) / 12));
      compact.push(values[sourceY * 32 + sourceX]);
    }
  }
  return encodeVector(compact);
}

async function imageSignature(imageBuffer) {
  const normalized = await sharp(imageBuffer)
    .rotate()
    .resize(NORMALIZED_WIDTH, NORMALIZED_HEIGHT, { fit: "fill", kernel: sharp.kernel.linear })
    .removeAlpha()
    .raw()
    .toBuffer();
  const raw = new Uint8Array(normalized.buffer, normalized.byteOffset, normalized.byteLength);
  const color = colorSignature(raw);
  return {
    differenceHash: differenceHash(raw),
    averageHash: averageHash(raw),
    artworkHash: artworkHash(raw),
    detailVector: encodeVector(lumaVector(resizeRgb(raw, NORMALIZED_WIDTH, NORMALIZED_HEIGHT, 18, 24))),
    artworkVector: encodeVector(artworkVector(raw)),
    artworkEdgeVector: encodeVector(artworkEdgeVector(raw)),
    spatialColorVector: encodeVector(spatialColorVector(raw)),
    titleVector: encodeVector(titleVector(raw)),
    setSymbolVector: encodeVector(regionEdgeVector(raw, {
      x: 0.82 * NORMALIZED_WIDTH,
      y: 0.42 * NORMALIZED_HEIGHT,
      width: 0.15 * NORMALIZED_WIDTH,
      height: 0.13 * NORMALIZED_HEIGHT,
    }, 16, 16)),
    footerVector: encodeVector(regionEdgeVector(raw, {
      x: 0.04 * NORMALIZED_WIDTH,
      y: 0.88 * NORMALIZED_HEIGHT,
      width: 0.92 * NORMALIZED_WIDTH,
      height: 0.1 * NORMALIZED_HEIGHT,
    }, 40, 8)),
    stampVector: encodeVector(regionEdgeVector(raw, {
      x: 0.015 * NORMALIZED_WIDTH,
      y: 0.84 * NORMALIZED_HEIGHT,
      width: 0.2 * NORMALIZED_WIDTH,
      height: 0.145 * NORMALIZED_HEIGHT,
    }, 20, 20)),
    chromaVector: encodeVector(chromaVector(raw)),
    edgeVector: encodeVector(edgeVector(raw)),
    colorVector: encodeVector(color.colorVector),
    dominantColor: color.dominantColor,
  };
}

async function parallelMap(items, worker, workerCount, label = "Bilder + Signaturen") {
  const output = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  const reportEvery = items.length >= 1000 ? 250 : 25;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index]);
      completed += 1;
      if (completed % reportEvery === 0 || completed === items.length) {
        process.stdout.write(`\r${label}: ${completed}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, () => runWorker()));
  process.stdout.write("\n");
  return output;
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value));
  await rename(temporaryPath, path);
}

async function writeJsonGzipAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(value)), { level: 9 });
  await writeFile(temporaryPath, compressed);
  await rename(temporaryPath, path);
}

async function readJson(path) {
  const contents = await readFile(path);
  const decoded = path.endsWith(".gz") ? await gunzipAsync(contents) : contents;
  return JSON.parse(decoded.toString("utf8"));
}

async function unlinkIfPresent(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function buildSelectedSets() {
  const rawSets = [];
  for (const setCode of setCodes) {
    rawSets.push(await fetchSet(setCode));
    await wait(120);
  }
  const allCards = rawSets.flatMap(mapCards);
  const cards = limit > 0 ? allCards.slice(0, limit) : allCards;
  const indexedCards = await parallelMap(
    cards,
    indexCard,
    concurrency,
  );
  const payload = {
    formatVersion: 1,
    indexVersion: SELECTED_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    sets: setCodes.map((setCode) => setCode.toUpperCase()),
    cardCount: indexedCards.length,
    cardAspectRatio: CARD_ASPECT_RATIO,
    cards: indexedCards,
  };
  await writeJsonAtomic(outputPath, payload);
  const outputSize = (await stat(outputPath)).size;
  process.stdout.write(`Index geschrieben: ${outputPath} (${(outputSize / 1024 / 1024).toFixed(2)} MiB)\n`);
}

async function reusableShard(path, cards) {
  if (forceDownload) return null;
  const candidates = [path, path.endsWith(".gz") ? path.slice(0, -3) : null].filter(Boolean);
  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    try {
      const payload = await readJson(candidate);
      if (
        payload.indexVersion === ALL_INDEX_VERSION &&
        payload.cardCount === cards.length &&
        payload.cards.every((card, index) => card.id === cards[index].id)
      ) return { cards: payload.cards, sourcePath: candidate };
    } catch {
      // A partial or outdated shard is rebuilt below.
    }
  }
  return null;
}

async function buildAllSets() {
  const bulk = await defaultCardsBulkData();
  const bulkPath = await downloadBulkData(bulk);
  const setGroups = await readAllPhysicalCards(bulkPath);
  const sortedSets = [...setGroups.entries()].sort(([left], [right]) => left.localeCompare(right));
  const totalCards = sortedSets.reduce((sum, [, group]) => sum + group.cards.length, 0);
  const shardDirectory = join(outputDirectory, "shards");
  await mkdir(shardDirectory, { recursive: true });
  const manifestSets = [];
  const routingEntries = [];
  let completedCards = 0;

  async function publishIndex(complete = false) {
    const routingPath = join(outputDirectory, "routing.json.gz");
    await writeJsonGzipAtomic(routingPath, {
      formatVersion: 1,
      indexVersion: ALL_INDEX_VERSION,
      complete,
      entries: routingEntries,
    });
    const manifestPath = join(outputDirectory, "manifest.json");
    await writeJsonAtomic(manifestPath, {
      formatVersion: 1,
      indexVersion: ALL_INDEX_VERSION,
      complete,
      generatedAt: new Date().toISOString(),
      bulkUpdatedAt: bulk.updated_at,
      source: "scryfall-default-cards",
      setCount: manifestSets.length,
      cardCount: completedCards,
      totalCardCount: totalCards,
      routingFile: "routing.json.gz",
      sets: manifestSets,
    });
    process.stdout.write(
      `${complete ? "Vollständiger Index" : "Zwischenindex"} geschrieben: ${manifestPath}\n`,
    );
    await unlinkIfPresent(join(outputDirectory, "routing.json"));
  }

  for (const [setCode, group] of sortedSets) {
    const shardPath = join(shardDirectory, `${setCode.replace(/[^a-z0-9_-]/g, "-")}.json.gz`);
    const reusable = await reusableShard(shardPath, group.cards);
    let indexedCards = reusable?.cards;
    if (indexedCards) {
      process.stdout.write(`${setCode.toUpperCase()}: ${indexedCards.length} Signaturen aus Shard-Cache\n`);
      if (reusable.sourcePath !== shardPath) {
        await writeJsonGzipAtomic(shardPath, {
          formatVersion: 1,
          indexVersion: ALL_INDEX_VERSION,
          setCode: setCode.toUpperCase(),
          setName: group.name,
          cardCount: indexedCards.length,
          cards: indexedCards,
        });
        await unlinkIfPresent(reusable.sourcePath);
      }
    } else {
      indexedCards = await parallelMap(
        group.cards,
        indexCard,
        concurrency,
        `${setCode.toUpperCase()} Bilder + Signaturen`,
      );
      await writeJsonGzipAtomic(shardPath, {
        formatVersion: 1,
        indexVersion: ALL_INDEX_VERSION,
        setCode: setCode.toUpperCase(),
        setName: group.name,
        cardCount: indexedCards.length,
        cards: indexedCards,
      });
    }

    const setIndex = manifestSets.length;
    indexedCards.forEach((card, position) => {
      routingEntries.push([
        setIndex,
        position,
        card.signature.differenceHash,
        card.signature.averageHash,
        card.signature.chromaVector,
        compactSpatialVector(
          Array.from(Buffer.from(card.signature.spatialColorVector, "base64"), (byte) => byte / 255),
        ),
        compactEdgeVector(
          Array.from(Buffer.from(card.signature.edgeVector, "base64"), (byte) => byte / 255),
        ),
        compactTitleVector(
          Array.from(Buffer.from(card.signature.titleVector, "base64"), (byte) => byte / 255),
        ),
        card.signature.artworkHash,
        compactArtworkEdgeVector(
          Array.from(Buffer.from(card.signature.artworkEdgeVector, "base64"), (byte) => byte / 255),
        ),
      ]);
    });
    manifestSets.push({
      code: setCode.toUpperCase(),
      name: group.name,
      cardCount: indexedCards.length,
      file: `shards/${basename(shardPath)}`,
    });
    completedCards += indexedCards.length;
    process.stdout.write(`Gesamtfortschritt: ${completedCards}/${totalCards} Bilder\n`);
    if (manifestSets.length % 25 === 0 || completedCards === totalCards) {
      await publishIndex(completedCards === totalCards);
    }
  }
  if (completedCards !== totalCards) await publishIndex(false);
}

async function main() {
  if (!allSets && !setCodes.length) throw new Error("Mindestens ein Setcode ist erforderlich.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error("--concurrency muss zwischen 1 und 32 liegen.");
  }
  await mkdir(imageDirectory, { recursive: true });
  if (allSets) await buildAllSets();
  else await buildSelectedSets();
}

await main();
