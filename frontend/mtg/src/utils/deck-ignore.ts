/**
 * The per-deck ignore list: cards the advisor must never suggest again.
 *
 * Kept on the device for now, like the speed override — the graph applies it
 * per request through the `excluded` parameter, so nothing server-side needs
 * to know the list exists. Names ride along with the oracle ids so the manage
 * dialog can say what is ignored without resolving anything.
 */

/** Where the ignore lists live, one map for all decks */
const STORAGE_KEY = "cardlens.deck-ignore.v1";

/** One ignored card, remembered by identity and name */
export type IgnoredCard = {
    /** The oracle identity the graph filters on */
    oracle_id: string;
    /** The name, for showing the list */
    name: string;
};

/**
 * Reads every stored list, dropping anything malformed
 *
 * @returns the lists by deck uuid
 */
function readAll(): Record<string, Array<IgnoredCard>> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return {};
        const held: Record<string, Array<IgnoredCard>> = {};
        for (const [uuid, cards] of Object.entries(parsed)) {
            if (!Array.isArray(cards)) continue;
            const sound = cards.filter(
                (card): card is IgnoredCard =>
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
 * Reads one deck's ignore list
 *
 * @param deckUuid the deck
 *
 * @returns the ignored cards, oldest first
 */
export function readIgnored(deckUuid: string): Array<IgnoredCard> {
    return readAll()[deckUuid] ?? [];
}

/**
 * Stores one deck's ignore list, dropping the entry when it empties
 *
 * @param deckUuid the deck
 * @param cards the list to store
 */
export function writeIgnored(deckUuid: string, cards: Array<IgnoredCard>): void {
    const held = readAll();
    if (cards.length === 0) delete held[deckUuid];
    else held[deckUuid] = cards;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(held));
    } catch {
        // Full or unavailable storage costs persistence, not the feature.
    }
}
