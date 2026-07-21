import type { CardRecord, CollectionEntry } from "./types";

const STORAGE_KEY = "card-lens:collection";

export function loadCollection(): CollectionEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CollectionEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveCollection(entries: CollectionEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function addCard(entries: CollectionEntry[], card: CardRecord, foil = false): CollectionEntry[] {
  const existing = entries.find((entry) => entry.card.id === card.id);
  if (!existing) {
    return [
      {
        card,
        quantity: foil ? 0 : 1,
        foilQuantity: foil ? 1 : 0,
        addedAt: new Date().toISOString(),
      },
      ...entries,
    ];
  }
  return entries.map((entry) =>
    entry.card.id === card.id
      ? {
          ...entry,
          quantity: entry.quantity + (foil ? 0 : 1),
          foilQuantity: entry.foilQuantity + (foil ? 1 : 0),
        }
      : entry,
  );
}

export function totalCards(entries: CollectionEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.quantity + entry.foilQuantity, 0);
}

export function collectionValue(entries: CollectionEntry[]): number {
  return entries.reduce(
    (sum, entry) => sum + (entry.card.priceEur ?? 0) * (entry.quantity + entry.foilQuantity),
    0,
  );
}
