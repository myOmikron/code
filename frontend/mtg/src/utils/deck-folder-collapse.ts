/**
 * Which shelves of the deck list are folded shut.
 *
 * In localStorage rather than on the account: how much of the list somebody
 * wants to see at once is about the screen they are looking at it on, not about
 * their decks. The account id is part of the key for the same reason as in
 * {@link "src/utils/deck-view-settings"} — two people sharing a browser must
 * not fold each other's shelves.
 *
 * The archive starts folded. It is the one shelf whose whole point is being out
 * of the way, and a list that opens with it closed is the list somebody wanted
 * when they put a deck away.
 */

import { useCallback, useEffect, useState } from "react";
import { ARCHIVE_SECTION } from "src/utils/deck-folders";

const STORAGE_PREFIX = "cardlens.deck-folders.v1";

/** What is folded shut before anybody has folded anything */
const DEFAULT_COLLAPSED: Array<string> = [ARCHIVE_SECTION];

/**
 * The isolated storage slot for one account or for signed-out visitors
 *
 * @param accountUuid the current account, or `null` for a visitor
 *
 * @returns that user's versioned storage key
 */
function storageKey(accountUuid: string | null): string {
    return `${STORAGE_PREFIX}.${accountUuid ?? "guest"}`;
}

/**
 * Reads which sections one user has folded shut.
 *
 * @param accountUuid the current account, or `null` for a visitor
 *
 * @returns the section keys, the default set when nothing is stored
 */
function loadCollapsed(accountUuid: string | null): Array<string> {
    try {
        const raw = localStorage.getItem(storageKey(accountUuid));
        if (raw === null) return DEFAULT_COLLAPSED;
        const stored: unknown = JSON.parse(raw);
        if (!Array.isArray(stored)) return DEFAULT_COLLAPSED;
        return stored.filter((key): key is string => typeof key === "string");
    } catch {
        return DEFAULT_COLLAPSED;
    }
}

/**
 * Writes which sections are folded shut, tolerating unavailable browser storage
 *
 * @param accountUuid the current account, or `null` for a visitor
 * @param collapsed the section keys
 */
function saveCollapsed(accountUuid: string | null, collapsed: Array<string>): void {
    try {
        localStorage.setItem(storageKey(accountUuid), JSON.stringify(collapsed));
    } catch {
        // State still keeps the choice for this tab when storage is unavailable.
    }
}

/** What {@link useFolderCollapse} hands back */
export type FolderCollapse = {
    /** Whether a section is folded shut */
    collapsed: (key: string) => boolean;
    /** Folds a section shut, or opens it again */
    toggle: (key: string) => void;
};

/**
 * Keeps the folded shelves in React state and localStorage.
 *
 * @param accountUuid the current account, or `null` for a visitor
 *
 * @returns the reader and the toggle
 */
export function useFolderCollapse(accountUuid: string | null): FolderCollapse {
    const [folded, setFolded] = useState(() => loadCollapsed(accountUuid));

    useEffect(() => setFolded(loadCollapsed(accountUuid)), [accountUuid]);

    const collapsed = useCallback((key: string) => folded.includes(key), [folded]);

    const toggle = useCallback(
        (key: string) => {
            setFolded((current) => {
                const next = current.includes(key) ? current.filter((folded) => folded !== key) : [...current, key];
                saveCollapsed(accountUuid, next);
                return next;
            });
        },
        [accountUuid],
    );

    return { collapsed, toggle };
}
