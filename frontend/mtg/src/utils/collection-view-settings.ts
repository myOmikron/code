/**
 * Per-user preferences for looking at a collection's cards.
 *
 * The collection counterpart of the deck view settings, kept under a key of
 * its own so changing one never changes the other. One setting covers every
 * collection: a binder is looked at the way all binders are. The url still
 * wins, so a shared link shows what its sender saw.
 */

import type { EntryGrouping, EntrySort } from "src/api/generated";
import { DECK_TILE_SIZES, DECK_VIEWS } from "src/utils/deck-view-settings";
import type { DeckTileSize, DeckView } from "src/utils/deck-view-settings";

/** The groupings on offer to the owner, in the order they are listed */
export const COLLECTION_GROUPINGS: Array<EntryGrouping> = ["none", "type", "mana_value", "color", "set", "tag"];

/** The groupings on offer to a visitor, who does not see the owner's tags */
export const VISITOR_COLLECTION_GROUPINGS: Array<EntryGrouping> = COLLECTION_GROUPINGS.filter(
    (option) => option !== "tag",
);

/** The orders on offer, in the order they are listed */
export const COLLECTION_SORTS: Array<EntrySort> = [
    "filed",
    "name",
    "set",
    "rarity",
    "mana_value",
    "unit_price",
    "stack_value",
    "quantity",
    "condition",
];

/**
 * The orders on offer to a visitor
 *
 * Without the two that order by money: somebody else's collection is read
 * without prices, see `redact_entry` on the server.
 */
export const VISITOR_COLLECTION_SORTS: Array<EntrySort> = COLLECTION_SORTS.filter(
    (option) => option !== "unit_price" && option !== "stack_value",
);

/** What the owner of a collection is offered */
export const OWNER_COLLECTION_OFFER = { groupings: COLLECTION_GROUPINGS, sorts: COLLECTION_SORTS };

/** What a visitor of somebody else's collection is offered */
export const VISITOR_COLLECTION_OFFER = { groupings: VISITOR_COLLECTION_GROUPINGS, sorts: VISITOR_COLLECTION_SORTS };

/** Everything about how a collection's cards are shown */
export type CollectionViewSettings = {
    /** How the cards are laid out */
    view: DeckView;
    /** How big the cards are drawn in the grid and the stacks */
    size: DeckTileSize;
    /** What the cards inside a group are ordered by */
    sort: EntrySort;
    /** Whether that order is reversed */
    descending: boolean;
    /** What the list is broken up by */
    group: EntryGrouping;
};

/** What a user without stored preferences sees */
export const DEFAULT_COLLECTION_VIEW_SETTINGS: CollectionViewSettings = {
    view: "list",
    size: "m",
    sort: "filed",
    descending: false,
    group: "none",
};

/** The tile size the old large layout reads as */
const LARGE: DeckTileSize = "l";

const STORAGE_PREFIX = "cardlens.collection-view.v1";

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
 * The valid fields of a loose bag of values, anything unknown left out
 *
 * @param raw the values, from storage or the url
 *
 * @returns the settings that could be read
 */
function validFields(raw: Record<string, unknown>): Partial<CollectionViewSettings> {
    const read: Partial<CollectionViewSettings> = {};
    const view = DECK_VIEWS.find((option) => option === raw.view);
    if (view !== undefined) read.view = view;
    const size = DECK_TILE_SIZES.find((option) => option === raw.size);
    if (size !== undefined) read.size = size;
    const sort = COLLECTION_SORTS.find((option) => option === raw.sort);
    if (sort !== undefined) read.sort = sort;
    const group = COLLECTION_GROUPINGS.find((option) => option === raw.group);
    if (group !== undefined) read.group = group;
    return read;
}

/**
 * Reads and validates one user's stored view settings.
 *
 * @param accountUuid the current account, or `null` for a visitor
 *
 * @returns valid settings with field-level defaults
 */
export function loadCollectionViewSettings(accountUuid: string | null): CollectionViewSettings {
    try {
        const raw = localStorage.getItem(storageKey(accountUuid));
        if (raw === null) return DEFAULT_COLLECTION_VIEW_SETTINGS;
        const stored = JSON.parse(raw) as Record<string, unknown>;
        return {
            ...DEFAULT_COLLECTION_VIEW_SETTINGS,
            ...validFields(stored),
            descending: stored.descending === true,
        };
    } catch {
        return DEFAULT_COLLECTION_VIEW_SETTINGS;
    }
}

/**
 * Writes one user's complete settings, tolerating unavailable browser storage
 *
 * @param accountUuid the current account, or `null` for a visitor
 * @param settings the complete preferences to retain
 */
export function saveCollectionViewSettings(accountUuid: string | null, settings: CollectionViewSettings): void {
    try {
        localStorage.setItem(storageKey(accountUuid), JSON.stringify(settings));
    } catch {
        return;
    }
}

/**
 * The view settings a url's search params name
 *
 * The removed `large` layout reads as the grid at a large tile size, so old
 * links still open; a size the url names alongside it wins.
 *
 * @param search the raw search params
 *
 * @returns what the url says, anything it does not say left out
 */
export function readCollectionViewSearch(search: Record<string, unknown>): Partial<CollectionViewSettings> {
    const read = validFields(search);
    if (search.view === "large") {
        read.view = "grid";
        read.size ??= LARGE;
    }
    if (search.desc === true || search.desc === "true") read.descending = true;
    if (search.desc === false || search.desc === "false") read.descending = false;
    return read;
}

/**
 * The settings in force: the url's, then the stored ones
 *
 * Stacks need groups to stand in, so stacking an ungrouped list draws the grid.
 *
 * @param url what the url says
 * @param stored what the user keeps
 *
 * @returns the complete settings
 */
export function resolveCollectionView(
    url: Partial<CollectionViewSettings>,
    stored: CollectionViewSettings,
): CollectionViewSettings {
    const settings = { ...stored, ...url };
    if (settings.view === "stack" && settings.group === "none") settings.view = "grid";
    return settings;
}
