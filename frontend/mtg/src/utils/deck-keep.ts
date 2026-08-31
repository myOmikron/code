/**
 * The per-deck keep list: cards the advisor must stop proposing as cuts.
 *
 * The session-only `accepted` state this grew out of deliberately forgot
 * everything on reload — right for cards the advisor talked the user into
 * (tomorrow is a fresh judgement), wrong for an explicit human "Keep": the
 * owner said so once and found the same card back on the cut list after
 * every rebuild. Kept on the device like the ignore list and the theme
 * preferences — the graph applies it per request through the `keep`
 * parameter, so nothing server-side needs to know the list exists. Names
 * ride along with the oracle ids so the manage dialog can say what is kept
 * without resolving anything.
 */

/** Where the keep lists live, one map for all decks */
const STORAGE_KEY = "cardlens.deck-keep.v1";

/** One kept card, remembered by identity and name */
export type KeptCard = {
    /** The oracle identity the graph defends */
    oracle_id: string;
    /** The name, for showing the list */
    name: string;
};

/**
 * Reads every stored list, dropping anything malformed
 *
 * @returns the lists by deck uuid
 */
function readAll(): Record<string, Array<KeptCard>> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return {};
        const held: Record<string, Array<KeptCard>> = {};
        for (const [uuid, cards] of Object.entries(parsed)) {
            if (!Array.isArray(cards)) continue;
            const sound = cards.filter(
                (card): card is KeptCard =>
                    typeof card === "object" &&
                    card !== null &&
                    typeof card.oracle_id === "string" &&
                    typeof card.name === "string",
            );
            if (sound.length > 0) held[uuid] = sound;
        }
        return held;
    } catch {
        return {};
    }
}

/**
 * Reads one deck's keep list
 *
 * @param deckUuid the deck
 *
 * @returns the kept cards, oldest first
 */
export function readKept(deckUuid: string): Array<KeptCard> {
    return readAll()[deckUuid] ?? [];
}

/**
 * Stores one deck's keep list, dropping the entry when it empties
 *
 * @param deckUuid the deck
 * @param cards the list to store
 */
export function writeKept(deckUuid: string, cards: Array<KeptCard>): void {
    const held = readAll();
    if (cards.length === 0) delete held[deckUuid];
    else held[deckUuid] = cards;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(held));
    } catch {
        // Full or unavailable storage costs persistence, not the feature.
    }
}

/**
 * Drops a deleted deck's keep list.
 *
 * Keyed by deck uuid, so without this a deleted deck's entries sit in
 * localStorage for good — invisible, and never reachable again.
 *
 * @param deckUuid the deck that is gone
 */
export function forgetKept(deckUuid: string): void {
    writeKept(deckUuid, []);
}
