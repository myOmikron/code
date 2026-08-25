/**
 * Which cards the advisor is allowed to suggest at all.
 *
 * A Scryfall-flavoured query — `eur<5 -t:artifact year>=2020` — compiled
 * server-side into the retrieval filter (see `services/mtg-graph`'s
 * `poolquery`), so a budget or era restriction scopes every channel rather
 * than trimming a ranked answer afterwards.
 *
 * Kept on the device beside the ignore list and the theme preferences, for the
 * same reason: this is a lens on the advice, not deck content and not
 * something the table agreed to. The diagnosis of what a deck *is* never moves
 * because of it — only what gets offered.
 *
 * Nothing here validates the syntax. The service owns the grammar and answers
 * `/pool-query` with the position of the fault, so a restriction stored by an
 * older release keeps working when the grammar grows, and a query this release
 * cannot parse still reaches the reader as an error they can act on.
 */

/** Where the restrictions live, one map for all decks */
const STORAGE_KEY = "cardlens.deck-pool.v1";

/**
 * Reads every deck's stored restriction, dropping anything malformed
 *
 * @returns the queries by deck uuid
 */
function readAll(): Record<string, string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return {};
        const held: Record<string, string> = {};
        for (const [uuid, query] of Object.entries(parsed)) {
            // Type-checked per entry rather than wholesale: stored JSON is
            // whatever a past release or a hand-edit left behind, and one
            // malformed entry must not discard every other deck's restriction.
            if (typeof query === "string" && query.trim() !== "") held[uuid] = query.trim();
        }
        return held;
    } catch {
        return {};
    }
}

/**
 * Reads one deck's pool restriction
 *
 * @param deckUuid the deck
 *
 * @returns the query, or null when the deck searches the whole pool
 */
export function readPoolQuery(deckUuid: string): string | null {
    return readAll()[deckUuid] ?? null;
}

/**
 * Stores one deck's pool restriction, dropping the entry when it empties
 *
 * @param deckUuid the deck
 * @param query the restriction, or null to search the whole pool again
 */
export function writePoolQuery(deckUuid: string, query: string | null): void {
    const held = readAll();
    const clean = query?.trim() ?? "";
    if (clean === "") delete held[deckUuid];
    else held[deckUuid] = clean;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(held));
    } catch {
        // Full or unavailable storage costs persistence, not the restriction.
    }
}

/**
 * Drops a deleted deck's pool restriction
 *
 * @param deckUuid the deck that is gone
 */
export function forgetPoolQuery(deckUuid: string): void {
    writePoolQuery(deckUuid, null);
}
