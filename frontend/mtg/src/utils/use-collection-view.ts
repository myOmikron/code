/**
 * The view settings of one collection card page, between url and storage.
 *
 * The url is what the page loads from and what a link carries, so the stored
 * choice is written into it as soon as the account is known, and every change
 * goes into both.
 */

import { useEffect } from "react";
import type { EntryGrouping, EntrySort } from "src/api/generated";
import { useAccount } from "src/context/account";
import {
    DEFAULT_COLLECTION_VIEW_SETTINGS,
    loadCollectionViewSettings,
    readCollectionViewSearch,
    resolveCollectionView,
    saveCollectionViewSettings,
} from "src/utils/collection-view-settings";
import type { CollectionViewSettings } from "src/utils/collection-view-settings";
import type { DeckTileSize, DeckView } from "src/utils/deck-view-settings";

/** The groupings and orders a page offers */
export type CollectionViewOffer = {
    /** The groupings on offer */
    groupings: Array<EntryGrouping>;
    /** The orders on offer */
    sorts: Array<EntrySort>;
};

/** The search params a collection card page keeps its view in */
export type CollectionViewSearch = {
    /** How the cards are laid out */
    view?: DeckView;
    /** How big the cards are drawn */
    size?: DeckTileSize;
    /** What to order by */
    sort?: EntrySort;
    /** Whether to reverse that order */
    desc?: boolean;
    /** What to break the list up by */
    group?: EntryGrouping;
};

/**
 * Reads the view part of a page's search params
 *
 * @param search the raw search params
 * @param offer what the page offers, anything else is dropped
 *
 * @returns the view params the url names
 */
export function collectionViewSearch(
    search: Record<string, unknown>,
    offer: CollectionViewOffer,
): CollectionViewSearch {
    const read = readCollectionViewSearch(search);
    return {
        view: read.view,
        size: read.size,
        sort: read.sort !== undefined && offer.sorts.includes(read.sort) ? read.sort : undefined,
        desc: read.descending,
        group: read.group !== undefined && offer.groupings.includes(read.group) ? read.group : undefined,
    };
}

/**
 * The search params spelling out a complete set of settings
 *
 * @param settings the settings
 *
 * @returns every view param, explicitly
 */
function toSearch(settings: CollectionViewSettings): Required<CollectionViewSearch> {
    return {
        view: settings.view,
        size: settings.size,
        sort: settings.sort,
        desc: settings.descending,
        group: settings.group,
    };
}

/**
 * Keeps a collection card page's view in the url and the user's storage
 *
 * @param search the view params the url names now
 * @param offer what the page offers
 * @param go writes new search params, replacing the history entry when asked
 *
 * @returns the settings in force and a field-wise updater
 */
export function useCollectionView(
    search: CollectionViewSearch,
    offer: CollectionViewOffer,
    go: (next: CollectionViewSearch & { page?: number }, options: { replace?: boolean; resetScroll?: boolean }) => void,
): [CollectionViewSettings, (next: Partial<CollectionViewSettings>) => void] {
    const { account, loading } = useAccount();
    const accountUuid = account?.uuid ?? null;

    /**
     * What the user keeps, held to what this page offers
     *
     * @returns the stored settings
     */
    function stored(): CollectionViewSettings {
        const kept = loadCollectionViewSettings(accountUuid);
        return {
            ...kept,
            group: offer.groupings.includes(kept.group) ? kept.group : DEFAULT_COLLECTION_VIEW_SETTINGS.group,
            sort: offer.sorts.includes(kept.sort) ? kept.sort : DEFAULT_COLLECTION_VIEW_SETTINGS.sort,
        };
    }

    const url = {
        view: search.view,
        size: search.size,
        sort: search.sort,
        descending: search.desc,
        group: search.group,
    };
    const defined = Object.fromEntries(
        Object.entries(url).filter(([, value]) => value !== undefined),
    ) as Partial<CollectionViewSettings>;
    const settings = resolveCollectionView(defined, stored());

    useEffect(() => {
        if (loading) return;
        const full = toSearch(settings);
        const missing = Object.fromEntries(
            Object.entries(full).filter(([key]) => search[key as keyof CollectionViewSearch] === undefined),
        );
        if (Object.keys(missing).length > 0) go(missing, { replace: true, resetScroll: false });
    }, [loading, accountUuid]);

    /**
     * Applies and remembers a change
     *
     * Only the changed fields are remembered: the rest of a link someone
     * else sent stays theirs. A different order or grouping starts over on
     * the first page.
     *
     * @param next the fields that change
     */
    function change(next: Partial<CollectionViewSettings>) {
        const changed = resolveCollectionView(next, settings);
        saveCollectionViewSettings(accountUuid, resolveCollectionView(next, stored()));
        const reorders = next.sort !== undefined || next.descending !== undefined || next.group !== undefined;
        go({ ...toSearch(changed), ...(reorders ? { page: 1 } : {}) }, { resetScroll: reorders ? undefined : false });
    }

    return [settings, change];
}
