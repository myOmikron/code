import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DECK_VIEW_SETTINGS, loadDeckViewSettings, saveDeckViewSettings } from "src/utils/deck-view-settings";

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

describe("deck view settings", () => {
    it("keeps different users in separate storage slots", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", storage(values));

        saveDeckViewSettings("first", { sort: "price", size: "xl", view: "list" });

        expect(loadDeckViewSettings("first")).toEqual({ sort: "price", size: "xl", view: "list" });
        expect(loadDeckViewSettings("second")).toEqual(DEFAULT_DECK_VIEW_SETTINGS);
    });

    it("replaces invalid stored fields with defaults", () => {
        const values = new Map([
            ["cardlens.deck-view.v1.user", JSON.stringify({ sort: "random", size: "huge", view: "album" })],
        ]);
        vi.stubGlobal("localStorage", storage(values));

        expect(loadDeckViewSettings("user")).toEqual(DEFAULT_DECK_VIEW_SETTINGS);
    });

    it("keeps the table view", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", storage(values));

        saveDeckViewSettings("user", { sort: "mana", size: "s", view: "table" });

        expect(loadDeckViewSettings("user").view).toBe("table");
    });
});
