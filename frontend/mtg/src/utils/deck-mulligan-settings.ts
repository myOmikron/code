import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "cardlens.deck-free-mulligan.v1";

/**
 * The isolated storage slot for one deck
 *
 * @param deckId the stable local identifier of the deck
 *
 * @returns that deck's versioned storage key
 */
function storageKey(deckId: string): string {
    return `${STORAGE_PREFIX}.${deckId}`;
}

/**
 * Reads whether one deck uses a free mulligan
 *
 * @param deckId the deck to read
 *
 * @returns the stored choice, true when absent or invalid
 */
export function loadDeckFreeMulligan(deckId: string): boolean {
    try {
        return localStorage.getItem(storageKey(deckId)) !== "false";
    } catch {
        return true;
    }
}

/**
 * Remembers whether one deck uses a free mulligan
 *
 * @param deckId the deck to write
 * @param enabled whether its free mulligan is enabled
 */
export function saveDeckFreeMulligan(deckId: string, enabled: boolean): void {
    try {
        localStorage.setItem(storageKey(deckId), String(enabled));
    } catch {
        // State still keeps the choice for this tab when storage is unavailable.
    }
}

/**
 * Keeps one deck's free-mulligan rule in React state and localStorage
 *
 * @param deckId the stable local identifier of the deck
 *
 * @returns the current choice and its updater
 */
export function useDeckFreeMulligan(deckId: string): [boolean, (enabled: boolean) => void] {
    const [enabled, setEnabled] = useState(() => loadDeckFreeMulligan(deckId));

    useEffect(() => setEnabled(loadDeckFreeMulligan(deckId)), [deckId]);

    const update = useCallback(
        (next: boolean) => {
            setEnabled(next);
            saveDeckFreeMulligan(deckId, next);
        },
        [deckId],
    );

    return [enabled, update];
}
