import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDeckFreeMulligan, saveDeckFreeMulligan } from "src/utils/deck-mulligan-settings";

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

describe("deck free mulligan settings", () => {
    it("keeps different decks in separate storage slots", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", storage(values));

        saveDeckFreeMulligan("first", true);

        expect(loadDeckFreeMulligan("first")).toBe(true);
        expect(loadDeckFreeMulligan("second")).toBe(false);
    });

    it("falls back to disabled for invalid stored values", () => {
        const values = new Map([["cardlens.deck-free-mulligan.v1.deck", "yes"]]);
        vi.stubGlobal("localStorage", storage(values));

        expect(loadDeckFreeMulligan("deck")).toBe(false);
    });
});
