/**
 * Per-user preferences for looking at a deck.
 *
 * They live in localStorage rather than on a deck: changing from tiles to rows
 * describes how this person likes to browse every deck on this device. Keeping
 * the account id in the key prevents two people sharing a browser from
 * overwriting each other's choices. Public visitors get a separate guest key.
 */

import { useCallback, useEffect, useState } from "react";
import { DECK_SORTS } from "src/utils/deck-grouping";
import type { DeckSort } from "src/utils/deck-grouping";

/** How a deck's cards are laid out */
export type DeckView = "list" | "grid" | "stack" | "table";

/** The views on offer, in the order they are listed */
export const DECK_VIEWS: Array<DeckView> = ["grid", "stack", "list", "table"];

/** How big the cards are drawn in the grid */
export type DeckTileSize = "xs" | "s" | "m" | "l" | "xl";

/** The sizes on offer, from smallest to largest */
export const DECK_TILE_SIZES: Array<DeckTileSize> = ["xs", "s", "m", "l", "xl"];

/** The three choices shared by every deck card view */
export type DeckViewSettings = {
    sort: DeckSort;
    size: DeckTileSize;
    view: DeckView;
};

/** What a user without stored preferences sees */
export const DEFAULT_DECK_VIEW_SETTINGS: DeckViewSettings = {
    sort: "name",
    size: "m",
    view: "grid",
};

const STORAGE_PREFIX = "cardlens.deck-view.v1";

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
 * Reads and validates one user's stored view settings.
 *
 * @param accountUuid the current account, or `null` for a visitor
 *
 * @returns valid settings with field-level defaults
 */
export function loadDeckViewSettings(accountUuid: string | null): DeckViewSettings {
    try {
        const raw = localStorage.getItem(storageKey(accountUuid));
        if (raw === null) return DEFAULT_DECK_VIEW_SETTINGS;
        const stored = JSON.parse(raw) as Partial<DeckViewSettings>;
        return {
            sort: DECK_SORTS.find((option) => option === stored.sort) ?? DEFAULT_DECK_VIEW_SETTINGS.sort,
            size: DECK_TILE_SIZES.find((option) => option === stored.size) ?? DEFAULT_DECK_VIEW_SETTINGS.size,
            view: DECK_VIEWS.find((option) => option === stored.view) ?? DEFAULT_DECK_VIEW_SETTINGS.view,
        };
    } catch {
        return DEFAULT_DECK_VIEW_SETTINGS;
    }
}

/**
 * Writes one user's complete settings, tolerating unavailable browser storage
 *
 * @param accountUuid the current account, or `null` for a visitor
 * @param settings the complete preferences to retain
 */
export function saveDeckViewSettings(accountUuid: string | null, settings: DeckViewSettings): void {
    try {
        localStorage.setItem(storageKey(accountUuid), JSON.stringify(settings));
    } catch {
        // State still keeps the choice for this tab when storage is unavailable.
    }
}

/**
 * Keeps deck view preferences in React state and localStorage.
 *
 * @param accountUuid the current account, or `null` for a visitor
 *
 * @returns current settings and a field-wise updater
 */
export function useDeckViewSettings(
    accountUuid: string | null,
): [DeckViewSettings, (next: Partial<DeckViewSettings>) => void] {
    const [settings, setSettings] = useState(() => loadDeckViewSettings(accountUuid));

    useEffect(() => setSettings(loadDeckViewSettings(accountUuid)), [accountUuid]);

    const update = useCallback(
        (next: Partial<DeckViewSettings>) => {
            setSettings((current) => {
                const changed = { ...current, ...next };
                saveDeckViewSettings(accountUuid, changed);
                return changed;
            });
        },
        [accountUuid],
    );

    return [settings, update];
}
