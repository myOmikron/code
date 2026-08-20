/**
 * The per-deck analysis speed, kept on the device.
 *
 * The deck's claimed bracket stays the deck's own statement and drives the
 * advisor's default speed. This override only tunes what the *analysis* is
 * held to — "read my bracket-3 deck as if it were faster" — so it lives in
 * localStorage like the view settings, not on the deck.
 */

/** Where the overrides live, one map for all decks */
const STORAGE_KEY = "cardlens.deck-speed.v1";

/**
 * Reads every stored override, dropping anything malformed
 *
 * @returns the overrides by deck uuid
 */
function readAll(): Record<string, number> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return {};
        const held: Record<string, number> = {};
        for (const [uuid, speed] of Object.entries(parsed)) {
            if (typeof speed === "number" && speed >= 0 && speed <= 1) held[uuid] = speed;
        }
        return held;
    } catch {
        return {};
    }
}

/**
 * Reads one deck's stored speed override
 *
 * @param deckUuid the deck
 *
 * @returns the override, or `null` when the bracket should decide
 */
export function readSpeedOverride(deckUuid: string): number | null {
    return readAll()[deckUuid] ?? null;
}

/**
 * Stores or clears one deck's speed override
 *
 * @param deckUuid the deck
 * @param speed the override, or `null` to hand the decision back to the bracket
 */
export function writeSpeedOverride(deckUuid: string, speed: number | null): void {
    const held = readAll();
    if (speed === null) delete held[deckUuid];
    else held[deckUuid] = speed;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(held));
    } catch {
        // Full or unavailable storage costs persistence, not the slider.
    }
}

/**
 * Drops a deleted deck's speed override, for the reason in `forgetIgnored`.
 *
 * @param deckUuid the deck that is gone
 */
export function forgetSpeedOverride(deckUuid: string): void {
    writeSpeedOverride(deckUuid, null);
}
