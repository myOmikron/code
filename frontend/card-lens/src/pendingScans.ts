//! The staging list every recognised card lands in before it goes anywhere else.
//!
//! Entries are kept as **individual scan events** rather than as per-card quantities. A queue that
//! is going to be handed to a backend needs each item to be identifiable on its own: to drop a
//! single mis-scan without touching the others, and to acknowledge exactly what the server took.
//! Aggregating into counts would throw away both, and the display can group when it wants to.
//!
//! Persistence is `localStorage` for now; the store is deliberately the only place that knows
//! that, so swapping in a backend touches this file and nothing else.
import type { CardRecord } from "./types";

const STORAGE_KEY = "cardlens.pendingScans.v1";
/** The pre-staging-list collection, migrated once so its cards are not stranded. */
const LEGACY_COLLECTION_KEY = "card-lens:collection";

/** One recognised card, as scanned. */
export type PendingScan = {
  /** Stable per-entry id — what a backend would acknowledge. */
  id: string;
  card: CardRecord;
  foil: boolean;
  /** ISO timestamp of the scan. */
  scannedAt: string;
};

function newId(): string {
  // `randomUUID` needs a secure context; the app also runs over plain http on a LAN in dev.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPendingScan(value: unknown): value is PendingScan {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<PendingScan>;
  return typeof entry.id === "string" && typeof entry.scannedAt === "string" && typeof entry.foil === "boolean"
    && typeof entry.card === "object" && entry.card !== null && typeof (entry.card as CardRecord).id === "string";
}

/** Build an entry for a freshly recognised card. */
export function createPendingScan(card: CardRecord, foil: boolean): PendingScan {
  return { id: newId(), card, foil, scannedAt: new Date().toISOString() };
}

/** Everything the old aggregated collection held, flattened into one entry per copy. */
function migrateLegacyCollection(raw: string): PendingScan[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const scans: PendingScan[] = [];
  for (const entry of parsed as Array<{ card?: CardRecord; quantity?: number; foilQuantity?: number; addedAt?: string }>) {
    if (!entry?.card?.id) continue;
    const scannedAt = entry.addedAt ?? new Date().toISOString();
    for (let i = 0; i < (entry.quantity ?? 0); i += 1) scans.push({ id: newId(), card: entry.card, foil: false, scannedAt });
    for (let i = 0; i < (entry.foilQuantity ?? 0); i += 1) scans.push({ id: newId(), card: entry.card, foil: true, scannedAt });
  }
  return scans;
}

/** Read the staging list, migrating the pre-staging-list collection on first run. */
export function loadPendingScans(): PendingScan[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter(isPendingScan) : [];
    }
    const legacy = localStorage.getItem(LEGACY_COLLECTION_KEY);
    if (!legacy) return [];
    const migrated = migrateLegacyCollection(legacy);
    savePendingScans(migrated);
    localStorage.removeItem(LEGACY_COLLECTION_KEY);
    return migrated;
  } catch {
    return [];
  }
}

export function savePendingScans(scans: PendingScan[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
  } catch {
    // storage unavailable or full — the list stays in memory for this session
  }
}

/** Newest first, which is the order the list is reviewed in. */
export function addPendingScan(scans: PendingScan[], scan: PendingScan): PendingScan[] {
  return [scan, ...scans];
}

export function removePendingScan(scans: PendingScan[], id: string): PendingScan[] {
  return scans.filter((scan) => scan.id !== id);
}

/** Drop the entries a backend has taken; unknown ids are ignored. */
export function removePendingScans(scans: PendingScan[], ids: readonly string[]): PendingScan[] {
  const taken = new Set(ids);
  return scans.filter((scan) => !taken.has(scan.id));
}

/** Total EUR value of the staged cards. */
export function pendingValue(scans: PendingScan[]): number {
  return scans.reduce((sum, scan) => sum + (scan.card.priceEur ?? 0), 0);
}

/** One row per distinct card+finish, for a list that would otherwise repeat a playset four times.
 *  Keeps the member ids so removing a row can drop exactly one of its copies. */
export type PendingGroup = { card: CardRecord; foil: boolean; ids: string[] };

export function groupPendingScans(scans: PendingScan[]): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const scan of scans) {
    const key = `${scan.card.id}:${scan.foil ? "foil" : "normal"}`;
    const group = groups.get(key);
    if (group) group.ids.push(scan.id);
    else groups.set(key, { card: scan.card, foil: scan.foil, ids: [scan.id] });
  }
  return [...groups.values()];
}
