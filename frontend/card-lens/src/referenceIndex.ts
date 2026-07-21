import { createImageSignature, loadImage } from "./imageHash";
import type { CardRecord, IndexedCard } from "./types";

const DATABASE_NAME = "card-lens";
const STORE_NAME = "reference-index";
const INDEX_VERSION = "ltr-dsk-all-printings-v14-precomputed";
const PRECOMPUTED_INDEX_URL = "/data/reference-index.json";
const REUSABLE_INDEX_VERSIONS: string[] = [];
const INDEX_CONCURRENCY = 8;
const SET_CODES = ["ltr", "dsk"] as const;

type ScryfallCard = {
  id: string;
  name: string;
  set_name: string;
  set: string;
  collector_number: string;
  mana_cost?: string;
  type_line: string;
  colors?: string[];
  image_uris?: { small?: string; normal: string };
  card_faces?: Array<{ image_uris?: { small?: string; normal: string } }>;
  prices: { eur: string | null };
};

type ScryfallList = {
  data: ScryfallCard[];
  has_more: boolean;
  next_page?: string;
};

type SerializedSignature = {
  differenceHash: string;
  averageHash: string;
  artworkHash: string;
  detailVector: string;
  artworkVector: string;
  artworkEdgeVector: string;
  spatialColorVector: string;
  titleVector: string;
  setSymbolVector: string;
  footerVector: string;
  stampVector: string;
  chromaVector: string;
  edgeVector: string;
  colorVector: string;
  dominantColor: number;
};

type SerializedIndex = {
  formatVersion: number;
  indexVersion: string;
  cardCount: number;
  cards: Array<CardRecord & { signature: SerializedSignature }>;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedIndex(version = INDEX_VERSION): Promise<IndexedCard[] | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(version);
    request.onsuccess = () => resolve((request.result as IndexedCard[] | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeCachedIndex(cards: IndexedCard[]): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(cards, INDEX_VERSION);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function decodeVector(value: string): number[] {
  const binary = window.atob(value);
  return Array.from(binary, (character) => character.charCodeAt(0) / 255);
}

async function loadPrecomputedIndex(): Promise<IndexedCard[] | null> {
  try {
    const response = await fetch(PRECOMPUTED_INDEX_URL, { cache: "no-cache" });
    if (!response.ok) return null;
    const payload = (await response.json()) as SerializedIndex;
    if (
      payload.formatVersion !== 1 ||
      payload.indexVersion !== INDEX_VERSION ||
      payload.cardCount !== payload.cards.length
    ) return null;
    return payload.cards.map((card) => ({
      ...card,
      signature: {
        differenceHash: card.signature.differenceHash,
        averageHash: card.signature.averageHash,
        artworkHash: card.signature.artworkHash,
        detailVector: decodeVector(card.signature.detailVector),
        artworkVector: decodeVector(card.signature.artworkVector),
        artworkEdgeVector: decodeVector(card.signature.artworkEdgeVector),
        spatialColorVector: decodeVector(card.signature.spatialColorVector),
        titleVector: decodeVector(card.signature.titleVector),
        setSymbolVector: decodeVector(card.signature.setSymbolVector),
        footerVector: decodeVector(card.signature.footerVector),
        stampVector: decodeVector(card.signature.stampVector),
        chromaVector: decodeVector(card.signature.chromaVector),
        edgeVector: decodeVector(card.signature.edgeVector),
        colorVector: decodeVector(card.signature.colorVector),
        dominantColor: card.signature.dominantColor,
      },
    }));
  } catch {
    return null;
  }
}

function mapCard(card: ScryfallCard): CardRecord | null {
  const imageUrl =
    card.image_uris?.small ??
    card.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.small ??
    card.card_faces?.[0]?.image_uris?.normal;
  if (!imageUrl) return null;
  return {
    id: card.id,
    name: card.name,
    setName: card.set_name,
    setCode: card.set.toUpperCase(),
    collectorNumber: card.collector_number,
    manaCost: card.mana_cost ?? "",
    typeLine: card.type_line,
    colors: card.colors ?? [],
    imageUrl,
    priceEur: card.prices.eur ? Number(card.prices.eur) : null,
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function searchUrl(setCode: string): string {
  const query = encodeURIComponent(`e:${setCode} game:paper`);
  return `https://api.scryfall.com/cards/search?q=${query}&unique=prints&order=set&dir=asc&include_extras=true&include_variations=true`;
}

async function downloadSetCards(setCode: string): Promise<CardRecord[]> {
  const cards: ScryfallCard[] = [];
  let nextPage: string | undefined = searchUrl(setCode);

  while (nextPage) {
    const response = await fetch(nextPage, {
      headers: { Accept: "application/json;q=0.9,*/*;q=0.8" },
    });
    if (!response.ok) throw new Error(`Der ${setCode.toUpperCase()}-Kartenindex ist gerade nicht erreichbar.`);
    const result = (await response.json()) as ScryfallList;
    cards.push(...result.data);
    nextPage = result.has_more ? result.next_page : undefined;
    // Scryfall asks clients to stay below ten API requests per second.
    if (nextPage) await wait(120);
  }

  return cards.map(mapCard).filter((card): card is CardRecord => card !== null);
}

async function downloadReferenceCards(): Promise<CardRecord[]> {
  const sets: CardRecord[][] = [];
  for (const setCode of SET_CODES) {
    sets.push(await downloadSetCards(setCode));
    await wait(120);
  }
  return sets.flat();
}

async function createIndexedCard(card: CardRecord): Promise<IndexedCard> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const image = await loadImage(card.imageUrl);
      return { ...card, signature: createImageSignature(image) };
    } catch (error) {
      lastError = error;
      await wait(200 * (attempt + 1));
    }
  }
  throw lastError;
}

async function indexCards(
  cards: CardRecord[],
  onProgress?: (done: number, total: number) => void,
): Promise<IndexedCard[]> {
  const indexedCards = new Array<IndexedCard>(cards.length);
  let cursor = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (cursor < cards.length) {
      const index = cursor;
      cursor += 1;
      indexedCards[index] = await createIndexedCard(cards[index]);
      completed += 1;
      onProgress?.(completed, cards.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(INDEX_CONCURRENCY, cards.length) }, () => worker()),
  );
  return indexedCards;
}

async function createReferenceIndex(onProgress?: (done: number, total: number) => void): Promise<IndexedCard[]> {
  const cached = await readCachedIndex();
  if (cached?.length) {
    onProgress?.(cached.length, cached.length);
    return cached;
  }

  const precomputed = await loadPrecomputedIndex();
  if (precomputed?.length) {
    onProgress?.(precomputed.length, precomputed.length);
    await writeCachedIndex(precomputed);
    return precomputed;
  }

  const cards = await downloadReferenceCards();
  let reusableCards: IndexedCard[] = [];
  for (const version of REUSABLE_INDEX_VERSIONS) {
    reusableCards = (await readCachedIndex(version)) ?? [];
    if (reusableCards.length) break;
  }
  const reusableById = new Map(reusableCards.map((card) => [card.id, card]));
  const currentIds = new Set(cards.map((card) => card.id));
  const reusedCount = reusableCards.filter((card) => currentIds.has(card.id)).length;
  const missingCards = cards.filter((card) => !reusableById.has(card.id));
  onProgress?.(reusedCount, cards.length);
  const newlyIndexed = await indexCards(missingCards, (done) => {
    onProgress?.(reusedCount + done, cards.length);
  });
  const newlyIndexedById = new Map(newlyIndexed.map((card) => [card.id, card]));
  const indexedCards = cards.map((card) => {
    const reusable = reusableById.get(card.id);
    return reusable
      ? { ...card, signature: reusable.signature }
      : newlyIndexedById.get(card.id)!;
  });
  await writeCachedIndex(indexedCards);
  return indexedCards;
}

let pendingIndex: Promise<IndexedCard[]> | null = null;

export function loadReferenceIndex(onProgress?: (done: number, total: number) => void): Promise<IndexedCard[]> {
  if (!pendingIndex) pendingIndex = createReferenceIndex(onProgress);
  else void pendingIndex.then((cards) => onProgress?.(cards.length, cards.length));
  return pendingIndex;
}
