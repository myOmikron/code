import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_COLLECTION_VIEW_SETTINGS,
    loadCollectionViewSettings,
    readCollectionViewSearch,
    resolveCollectionView,
    saveCollectionViewSettings,
} from "src/utils/collection-view-settings";
import { loadDeckViewSettings, saveDeckViewSettings } from "src/utils/deck-view-settings";

afterEach(() => vi.unstubAllGlobals());

/**
 * A minimal localStorage implementation backed by the supplied map
 *
 * @param values the mutable key/value backing store
 *
 * @returns a Storage-compatible wrapper
 */
function storage(values: Map<string, string>): Storage {
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
        key: (index) => [...values.keys()][index] ?? null,
        /** @returns number of keys currently stored */
        get length() {
            return values.size;
        },
    };
}

describe("collection view settings", () => {
    it("starts ungrouped, in rows, filed order", () => {
        vi.stubGlobal("localStorage", storage(new Map()));

        expect(loadCollectionViewSettings("someone")).toEqual({
            view: "list",
            size: "m",
            sort: "filed",
            descending: false,
            group: "none",
        });
    });

    it("keeps each account's choice to itself", () => {
        vi.stubGlobal("localStorage", storage(new Map()));
        const chosen = { view: "stack", size: "xl", sort: "unit_price", descending: true, group: "set" } as const;

        saveCollectionViewSettings("first", chosen);

        expect(loadCollectionViewSettings("first")).toEqual(chosen);
        expect(loadCollectionViewSettings("second")).toEqual(DEFAULT_COLLECTION_VIEW_SETTINGS);
        expect(loadCollectionViewSettings(null)).toEqual(DEFAULT_COLLECTION_VIEW_SETTINGS);
    });

    it("leaves the deck settings alone, and is left alone by them", () => {
        vi.stubGlobal("localStorage", storage(new Map()));

        saveCollectionViewSettings("user", { ...DEFAULT_COLLECTION_VIEW_SETTINGS, view: "table", size: "xs" });
        saveDeckViewSettings("user", { sort: "price", size: "xl", view: "stack" });

        expect(loadCollectionViewSettings("user").view).toBe("table");
        expect(loadCollectionViewSettings("user").size).toBe("xs");
        expect(loadDeckViewSettings("user").view).toBe("stack");
    });

    it("replaces invalid stored fields with defaults", () => {
        const values = new Map([
            [
                "cardlens.collection-view.v1.user",
                JSON.stringify({ view: "album", size: "huge", sort: "random", descending: "yes", group: "zone" }),
            ],
        ]);
        vi.stubGlobal("localStorage", storage(values));

        expect(loadCollectionViewSettings("user")).toEqual(DEFAULT_COLLECTION_VIEW_SETTINGS);
    });

    it("answers defaults when storage throws", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("blocked");
            },
        });

        expect(() => saveCollectionViewSettings("user", DEFAULT_COLLECTION_VIEW_SETTINGS)).not.toThrow();
        expect(loadCollectionViewSettings("user")).toEqual(DEFAULT_COLLECTION_VIEW_SETTINGS);
    });
});

describe("collection view from the url", () => {
    const stored = { view: "table", size: "s", sort: "name", descending: false, group: "type" } as const;

    it("lets the url win over what is stored", () => {
        const url = readCollectionViewSearch({ view: "grid", size: "xl", sort: "rarity", desc: "true", group: "set" });

        expect(resolveCollectionView(url, stored)).toEqual({
            view: "grid",
            size: "xl",
            sort: "rarity",
            descending: true,
            group: "set",
        });
    });

    it("takes what the url leaves out from storage", () => {
        expect(resolveCollectionView(readCollectionViewSearch({ group: "color" }), stored)).toEqual({
            ...stored,
            group: "color",
        });
    });

    it("reads an explicit ascending order from the url", () => {
        const descending = { ...stored, descending: true };

        expect(resolveCollectionView(readCollectionViewSearch({ desc: "false" }), descending).descending).toBe(false);
    });

    it("ignores what it does not know in the url", () => {
        expect(readCollectionViewSearch({ view: "album", size: "huge", sort: "random", group: "zone" })).toEqual({});
    });

    it("reads the old large layout as the grid at a large size", () => {
        expect(readCollectionViewSearch({ view: "large" })).toEqual({ view: "grid", size: "l" });
        expect(resolveCollectionView(readCollectionViewSearch({ view: "large", size: "xs" }), stored).size).toBe("xs");
    });

    it("falls back to the grid when stacking without a grouping", () => {
        expect(resolveCollectionView(readCollectionViewSearch({ view: "stack", group: "none" }), stored).view).toBe(
            "grid",
        );
        expect(resolveCollectionView(readCollectionViewSearch({ view: "stack" }), stored).view).toBe("stack");
    });
});
