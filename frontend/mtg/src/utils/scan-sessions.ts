//! The persistent scan sessions every recognised card lands in before it reaches a collection.
//!
//! A session is one physical batch — "this shoebox goes into that collection" — and several can be
//! open at once. Entries are kept as **individual scan events** rather than as per-card quantities:
//! transferring to the backend needs each item identifiable on its own, to drop a single mis-scan
//! without touching the others and to remove exactly what the server accepted. Aggregation happens
//! at transfer time, where equal (printing, condition, finish) merge into one collection entry.
//!
//! Persistence is `localStorage`; the store is deliberately the only place that knows that.
import type { CardCondition, CardFinish } from "src/api/generated";
import type { CardRecord } from "src/types";

const STORAGE_KEY = "cardlens.scanSessions.v1";
/** The single flat staging list this store grew out of, migrated once into a session. */
const LEGACY_PENDING_KEY = "cardlens.pendingScans.v1";

/** The collection a session's cards are destined for. The name is a display snapshot. */
export type ScanTarget = { uuid: string; name: string };

/** One recognised card, as scanned, plus everything the user may correct before the transfer. */
export type ScanEntry = {
    /** Stable per-entry id — what the transfer acknowledges. */
    id: string;
    /** Snapshot from the scanner index; carries set code and collector number for resolving. */
    card: CardRecord;
    /**
     * The runners-up from the same scan, so a wrong pick can be corrected later without
     *  rescanning. Measured over the labelled photos, the right printing is among the top three
     *  for 18 of 21 cards even when the top one is wrong — which is exactly what makes keeping
     *  them worthwhile.
     */
    alternatives: CardRecord[];
    /** ISO timestamp of the scan. */
    scannedAt: string;
    quantity: number;
    finish: CardFinish;
    condition: CardCondition;
    purchasePriceCents: number | null;
    /** ISO date the cards were acquired. */
    acquiredAt: string | null;
};

/** One batch of scans, optionally bound to the collection it will be transferred into. */
export type ScanSession = {
    id: string;
    /** ISO timestamp of creation, which is how sessions are told apart in the overview. */
    createdAt: string;
    target: ScanTarget | null;
    /** Newest first, which is the order the review lists them in. */
    entries: ScanEntry[];
};

/**
 * A fresh id for a session or entry
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
function isScanEntry(value: unknown): value is ScanEntry {
    if (typeof value !== "object" || value === null) return false;
    const entry = value as Partial<ScanEntry>;
    return (
        typeof entry.id === "string" &&
        typeof entry.scannedAt === "string" &&
        typeof entry.quantity === "number" &&
        typeof entry.finish === "string" &&
        typeof entry.condition === "string" &&
        typeof entry.card === "object" &&
        entry.card !== null &&
        typeof (entry.card as CardRecord).id === "string"
    );
}

/**
 * Whether a value read back from storage is a usable session
 *
 * @param value
 * @returns
 */
function isScanSession(value: unknown): value is ScanSession {
    if (typeof value !== "object" || value === null) return false;
    const session = value as Partial<ScanSession>;
    return (
        typeof session.id === "string" &&
        typeof session.createdAt === "string" &&
        Array.isArray(session.entries) &&
        (session.target === null ||
            (typeof session.target === "object" && session.target !== null && typeof session.target.uuid === "string"))
    );
}

/**
 * Build a fresh, empty session
 *
 * @param target the collection the session scans into, if already known
 * @returns the new session
 */
export function createScanSession(target: ScanTarget | null = null): ScanSession {
    return { id: newId(), createdAt: new Date().toISOString(), target, entries: [] };
}

/**
 * Build an entry for a freshly recognised card, keeping the runners-up alongside it.
 *
 * The scanner only distinguishes foil from non-foil; everything else starts at the value a stack
 * of freshly sorted cards most likely has and is corrected in the review.
 *
 * @param card
 * @param foil the scan's foil toggle
 * @param alternatives
 * @returns the new entry
 */
export function createScanEntry(card: CardRecord, foil: boolean, alternatives: CardRecord[] = []): ScanEntry {
    return {
        id: newId(),
        card,
        alternatives: alternatives.filter((candidate) => candidate.id !== card.id),
        scannedAt: new Date().toISOString(),
        quantity: 1,
        finish: foil ? "Foil" : "Nonfoil",
        condition: "NearMint",
        purchasePriceCents: null,
        acquiredAt: null,
    };
}

/**
 * Everything the old flat staging list held, wrapped into one session so no scans are stranded.
 *
 * @param raw
 * @returns the sessions to start with
 */
function migrateLegacyPending(raw: string): ScanSession[] {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: ScanEntry[] = [];
    for (const scan of parsed as Array<{
        id?: string;
        card?: CardRecord;
        foil?: boolean;
        scannedAt?: string;
        alternatives?: CardRecord[];
    }>) {
        if (typeof scan?.id !== "string" || !scan.card?.id) continue;
        entries.push({
            id: scan.id,
            card: scan.card,
            alternatives: scan.alternatives ?? [],
            scannedAt: scan.scannedAt ?? new Date().toISOString(),
            quantity: 1,
            finish: scan.foil ? "Foil" : "Nonfoil",
            condition: "NearMint",
            purchasePriceCents: null,
            acquiredAt: null,
        });
    }
    if (entries.length === 0) return [];
    return [{ ...createScanSession(), entries }];
}

/**
 * Read all sessions, migrating the old flat staging list on first run.
 *
 * @returns the stored sessions
 */
export function loadScanSessions(): ScanSession[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
            const parsed: unknown = JSON.parse(stored);
            return Array.isArray(parsed)
                ? parsed
                      .filter(isScanSession)
                      .map((session) => ({ ...session, entries: session.entries.filter(isScanEntry) }))
                : [];
        }
        const legacy = localStorage.getItem(LEGACY_PENDING_KEY);
        if (!legacy) return [];
        const migrated = migrateLegacyPending(legacy);
        saveScanSessions(migrated);
        localStorage.removeItem(LEGACY_PENDING_KEY);
        return migrated;
    } catch {
        return [];
    }
}

/**
 * Persists all sessions
 *
 * @param sessions
 */
export function saveScanSessions(sessions: ScanSession[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
        // storage unavailable or full — the sessions stay in memory for this visit
    }
}

/**
 * Applies a change to one session, leaving the others alone
 *
 * @param sessions
 * @param id
 * @param change
 * @returns the updated list
 */
function mapSession(sessions: ScanSession[], id: string, change: (session: ScanSession) => ScanSession): ScanSession[] {
    return sessions.map((session) => (session.id === id ? change(session) : session));
}

/**
 * Drops a whole session
 *
 * @param sessions
 * @param id
 * @returns the updated list
 */
export function removeSession(sessions: ScanSession[], id: string): ScanSession[] {
    return sessions.filter((session) => session.id !== id);
}

/**
 * Points a session at the collection it will be transferred into
 *
 * @param sessions
 * @param id
 * @param target
 * @returns the updated list
 */
export function setSessionTarget(sessions: ScanSession[], id: string, target: ScanTarget | null): ScanSession[] {
    return mapSession(sessions, id, (session) => ({ ...session, target }));
}

/**
 * Newest first, which is the order the review lists them in.
 *
 * @param sessions
 * @param sessionId
 * @param entry
 * @returns the updated list
 */
export function addEntry(sessions: ScanSession[], sessionId: string, entry: ScanEntry): ScanSession[] {
    return mapSession(sessions, sessionId, (session) => ({ ...session, entries: [entry, ...session.entries] }));
}

/**
 * Corrects an entry's editable fields
 *
 * @param sessions
 * @param sessionId
 * @param entryId
 * @param patch the fields to change
 * @returns the updated list
 */
export function updateEntry(
    sessions: ScanSession[],
    sessionId: string,
    entryId: string,
    patch: Partial<Pick<ScanEntry, "quantity" | "finish" | "condition" | "purchasePriceCents" | "acquiredAt">>,
): ScanSession[] {
    return mapSession(sessions, sessionId, (session) => ({
        ...session,
        entries: session.entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
    }));
}

/**
 * Swap an entry's card for one of its alternatives, putting the replaced card back into the
 *  alternatives so the choice stays reversible.
 *
 * @param sessions
 * @param sessionId
 * @param entryId
 * @param card
 * @returns the updated list
 */
export function replaceEntryCard(
    sessions: ScanSession[],
    sessionId: string,
    entryId: string,
    card: CardRecord,
): ScanSession[] {
    return mapSession(sessions, sessionId, (session) => ({
        ...session,
        entries: session.entries.map((entry) => {
            if (entry.id !== entryId || entry.card.id === card.id) return entry;
            const alternatives = [entry.card, ...entry.alternatives].filter((candidate) => candidate.id !== card.id);
            return { ...entry, card, alternatives };
        }),
    }));
}

/**
 * Drops one entry, leaving the other copies of that card alone
 *
 * @param sessions
 * @param sessionId
 * @param entryId
 * @returns the updated list
 */
export function removeEntry(sessions: ScanSession[], sessionId: string, entryId: string): ScanSession[] {
    return mapSession(sessions, sessionId, (session) => ({
        ...session,
        entries: session.entries.filter((entry) => entry.id !== entryId),
    }));
}

/**
 * Drop the entries a transfer has taken; unknown ids are ignored.
 *
 * @param sessions
 * @param sessionId
 * @param entryIds
 * @returns the updated list
 */
export function removeEntries(sessions: ScanSession[], sessionId: string, entryIds: readonly string[]): ScanSession[] {
    const taken = new Set(entryIds);
    return mapSession(sessions, sessionId, (session) => ({
        ...session,
        entries: session.entries.filter((entry) => !taken.has(entry.id)),
    }));
}

/**
 * Total EUR value of a session's cards.
 *
 * @param session
 * @returns the total value in EUR
 */
export function sessionValue(session: ScanSession): number {
    return session.entries.reduce((sum, entry) => sum + (entry.card.priceEur ?? 0) * entry.quantity, 0);
}

/**
 * How many physical cards a session holds, counting quantities.
 *
 * @param session
 * @returns the number of cards
 */
export function sessionCardCount(session: ScanSession): number {
    return session.entries.reduce((sum, entry) => sum + entry.quantity, 0);
}
