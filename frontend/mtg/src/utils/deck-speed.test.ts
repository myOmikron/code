import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readSpeedOverride, writeSpeedOverride } from "src/utils/deck-speed";

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

describe("deck speed overrides", () => {
    const values = new Map<string, string>();
    beforeEach(() => {
        values.clear();
        vi.stubGlobal("localStorage", storage(values));
    });
    afterEach(() => vi.unstubAllGlobals());

    test("answers null until something is stored", () => {
        expect(readSpeedOverride("a")).toBeNull();
    });

    test("stores per deck and clears on null", () => {
        writeSpeedOverride("a", 0.75);
        writeSpeedOverride("b", 0.25);
        expect(readSpeedOverride("a")).toBe(0.75);
        expect(readSpeedOverride("b")).toBe(0.25);
        writeSpeedOverride("a", null);
        expect(readSpeedOverride("a")).toBeNull();
        expect(readSpeedOverride("b")).toBe(0.25);
    });

    test("drops malformed and out-of-range stored values", () => {
        values.set("cardlens.deck-speed.v1", JSON.stringify({ a: 2, b: "fast", c: 0.5 }));
        expect(readSpeedOverride("a")).toBeNull();
        expect(readSpeedOverride("b")).toBeNull();
        expect(readSpeedOverride("c")).toBe(0.5);
        values.set("cardlens.deck-speed.v1", "not json");
        expect(readSpeedOverride("c")).toBeNull();
    });
});
