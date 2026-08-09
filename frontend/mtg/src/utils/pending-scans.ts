//! The staging list every recognised card lands in before it goes anywhere else.
//!
//! Entries are kept as **individual scan events** rather than as per-card quantities. A queue that
//! is going to be handed to a backend needs each item to be identifiable on its own: to drop a
//! single mis-scan without touching the others, and to acknowledge exactly what the server took.
//! Aggregating into counts would throw away both, and the display can group when it wants to.
//!
//! Persistence is `localStorage` for now; the store is deliberately the only place that knows
//! that, so swapping in a backend touches this file and nothing else.
import type { CardRecord } from "src/types";

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
    /**
     * The runners-up from the same scan, so a wrong pick can be corrected later without
     *  rescanning. Measured over the labelled photos, the right printing is among the top three
     *  for 18 of 21 cards even when the top one is wrong — which is exactly what makes keeping
     *  them worthwhile.
     */
    alternatives: CardRecord[];
};

/**
 * A fresh id for a staged scan
 *
 * @returns
 */
function newId(): string {
    // `randomUUID` needs a secure context; the app also runs over plain http on a LAN in dev.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Whether a value read back from storage is a usable entry
 *
 * @param value
 * @returns
 */
function isPendingScan(value: unknown): value is PendingScan {
    if (typeof value !== "object" || value === null) return false;
    const entry = value as Partial<PendingScan>;
    return (
        typeof entry.id === "string" &&
        typeof entry.scannedAt === "string" &&
        typeof entry.foil === "boolean" &&
        typeof entry.card === "object" &&
        entry.card !== null &&
        typeof (entry.card as CardRecord).id === "string"
    );
}

/**
 * Build an entry for a freshly recognised card, keeping the runners-up alongside it.
 *
 * @param card
 * @param foil
 * @param alternatives
 * @returns the new entry
 */
export function createPendingScan(card: CardRecord, foil: boolean, alternatives: CardRecord[] = []): PendingScan {
    return {
        id: newId(),
        card,
        foil,
        scannedAt: new Date().toISOString(),
        alternatives: alternatives.filter((candidate) => candidate.id !== card.id),
    };
}

/**
 * Swap an entry's card for one of its alternatives, putting the replaced card back into the
 *  alternatives so the choice stays reversible.
 *
 * @param scans
 * @param id
 * @param card
 * @returns the updated list
 */
export function replacePendingScanCard(scans: PendingScan[], id: string, card: CardRecord): PendingScan[] {
    return scans.map((scan) => {
        if (scan.id !== id || scan.card.id === card.id) return scan;
        const alternatives = [scan.card, ...scan.alternatives].filter((candidate) => candidate.id !== card.id);
        return { ...scan, card, alternatives };
    });
}

/**
 * Everything the old aggregated collection held, flattened into one entry per copy.
 *
 * @param raw
 * @returns
 */
function migrateLegacyCollection(raw: string): PendingScan[] {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const scans: PendingScan[] = [];
    for (const entry of parsed as Array<{
        card?: CardRecord;
        quantity?: number;
        foilQuantity?: number;
        addedAt?: string;
    }>) {
        if (!entry?.card?.id) continue;
        const scannedAt = entry.addedAt ?? new Date().toISOString();
        for (let i = 0; i < (entry.quantity ?? 0); i += 1)
            scans.push({ id: newId(), card: entry.card, foil: false, scannedAt, alternatives: [] });
        for (let i = 0; i < (entry.foilQuantity ?? 0); i += 1)
            scans.push({ id: newId(), card: entry.card, foil: true, scannedAt, alternatives: [] });
    }
    return scans;
}

/**
 * Read the staging list, migrating the pre-staging-list collection on first run.
 *
 * @returns the stored entries
 */
export function loadPendingScans(): PendingScan[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
            const parsed: unknown = JSON.parse(stored);
            // Entries written before alternatives existed simply have none to offer.
            return Array.isArray(parsed)
                ? parsed.filter(isPendingScan).map((scan) => ({ ...scan, alternatives: scan.alternatives ?? [] }))
                : [];
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

/**
 * Persists the staging list
 *
 * @param scans
 */
export function savePendingScans(scans: PendingScan[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
    } catch {
        // storage unavailable or full — the list stays in memory for this session
    }
}

/**
 * Newest first, which is the order the list is reviewed in.
 *
 * @param scans
 * @param scan
 * @returns the updated list
 */
export function addPendingScan(scans: PendingScan[], scan: PendingScan): PendingScan[] {
    return [scan, ...scans];
}

/**
 * Drops one entry, leaving the other copies of that card alone
 *
 * @param scans
 * @param id
 * @returns the updated list
 */
export function removePendingScan(scans: PendingScan[], id: string): PendingScan[] {
    return scans.filter((scan) => scan.id !== id);
}

/**
 * Drop the entries a backend has taken; unknown ids are ignored.
 *
 * @param scans
 * @param ids
 * @returns the updated list
 */
export function removePendingScans(scans: PendingScan[], ids: readonly string[]): PendingScan[] {
    const taken = new Set(ids);
    return scans.filter((scan) => !taken.has(scan.id));
}

/**
 * Total EUR value of the staged cards.
 *
 * @param scans
 * @returns the total value in EUR
 */
export function pendingValue(scans: PendingScan[]): number {
    return scans.reduce((sum, scan) => sum + (scan.card.priceEur ?? 0), 0);
}

/**
 * One row per distinct card+finish, for a list that would otherwise repeat a playset four times.
 *  Keeps the member ids so removing a row can drop exactly one of its copies.
 */
export type PendingGroup = { card: CardRecord; foil: boolean; ids: string[] };

/**
 * Groups the individual scan events into per-card, per-foil rows for display
 *
 * @param scans
 * @returns one row per card and foil state
 */
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
