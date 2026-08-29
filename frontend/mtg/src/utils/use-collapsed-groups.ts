import { useCallback, useEffect, useState } from "react";

/**
 * Which groups of a decklist are folded away.
 *
 * Kept per deck and in `localStorage`, unlike the flipped cards: a deck read
 * with the lands folded away is read that way every time, and the folds are a
 * setting on the deck rather than an answer to a question asked once.
 *
 * The keys are the group slugs, which differ per grouping and never collide,
 * so one set carries the folds of all of them.
 */

const STORAGE_PREFIX = "cardlens.deck-collapsed-groups.v1";

/**
 * The isolated storage slot for one deck
 *
 * @param deckId the stable identifier of the deck
 *
 * @returns that deck's versioned storage key
 */
function storageKey(deckId: string): string {
    return `${STORAGE_PREFIX}.${deckId}`;
}

/**
 * Reads which of a deck's groups are folded away
 *
 * @param deckId the deck to read
 *
 * @returns the folded group slugs, empty when nothing is stored or it is unreadable
 */
function load(deckId: string): ReadonlySet<string> {
    try {
        const raw = localStorage.getItem(storageKey(deckId));
        if (raw === null) return new Set();
        const stored: unknown = JSON.parse(raw);
        if (!Array.isArray(stored)) return new Set();
        return new Set(stored.filter((key): key is string => typeof key === "string"));
    } catch {
        return new Set();
    }
}

/**
 * Remembers which of a deck's groups are folded away
 *
 * @param deckId the deck to write
 * @param keys the folded group slugs
 */
function save(deckId: string, keys: ReadonlySet<string>): void {
    try {
        localStorage.setItem(storageKey(deckId), JSON.stringify([...keys]));
    } catch {
        // State still keeps the folds for this tab when storage is unavailable.
    }
}

/** Which groups of a decklist are folded away, and how to fold one */
export type CollapsedGroups = {
    /** Whether this group is folded away */
    isCollapsed: (key: string) => boolean;
    /** Folds this group away, or opens it again */
    toggle: (key: string) => void;
};

/**
 * Keeps one deck's folded groups in React state and localStorage
 *
 * @param deckId the stable identifier of the deck
 *
 * @returns which groups are folded, and how to fold one
 */
export function useCollapsedGroups(deckId: string): CollapsedGroups {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => load(deckId));

    useEffect(() => setCollapsed(load(deckId)), [deckId]);

    const toggle = useCallback(
        (key: string) => {
            setCollapsed((current) => {
                const next = new Set(current);
                if (!next.delete(key)) next.add(key);
                save(deckId, next);
                return next;
            });
        },
        [deckId],
    );

    const isCollapsed = useCallback((key: string) => collapsed.has(key), [collapsed]);

    return { isCollapsed, toggle };
}
