import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readIgnored, writeIgnored } from "src/utils/deck-ignore";

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

describe("deck ignore lists", () => {
    const values = new Map<string, string>();
    beforeEach(() => {
        values.clear();
        vi.stubGlobal("localStorage", storage(values));
    });
    afterEach(() => vi.unstubAllGlobals());

    test("answers empty until something is stored", () => {
        expect(readIgnored("a")).toEqual([]);
    });

    test("stores per deck and clears empty lists", () => {
        writeIgnored("a", [{ oracle_id: "x", name: "Sol Ring" }]);
        writeIgnored("b", [{ oracle_id: "y", name: "Cultivate" }]);
        expect(readIgnored("a")).toEqual([{ oracle_id: "x", name: "Sol Ring" }]);
        writeIgnored("a", []);
        expect(readIgnored("a")).toEqual([]);
        expect(readIgnored("b")).toHaveLength(1);
    });

    test("drops malformed stored entries", () => {
        values.set(
            "cardlens.deck-ignore.v1",
            JSON.stringify({ a: [{ oracle_id: "x", name: "Sol Ring" }, { oracle_id: 3 }, "junk"], b: "junk" }),
        );
        expect(readIgnored("a")).toEqual([{ oracle_id: "x", name: "Sol Ring" }]);
        expect(readIgnored("b")).toEqual([]);
    });
});
