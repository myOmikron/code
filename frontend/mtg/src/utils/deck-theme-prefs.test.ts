import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    DEFAULT_THEME_PREFS,
    cycleTheme,
    pruneThemePrefs,
    readThemePrefs,
    themePrefsKey,
    themeState,
    writeThemePrefs,
} from "src/utils/deck-theme-prefs";

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

describe("theme preferences", () => {
    const values = new Map<string, string>();
    beforeEach(() => {
        values.clear();
        vi.stubGlobal("localStorage", storage(values));
    });
    afterEach(() => vi.unstubAllGlobals());

    test("a deck with no opinion recorded reads as neutral", () => {
        expect(readThemePrefs("a")).toEqual(DEFAULT_THEME_PREFS);
        expect(themeState(readThemePrefs("a"), "tokens")).toBe("neutral");
    });

    test("stores per deck and drops an emptied entry", () => {
        writeThemePrefs("a", { pinned: ["tokens"], excluded: [] });
        writeThemePrefs("b", { pinned: [], excluded: ["stax"] });
        expect(readThemePrefs("a").pinned).toEqual(["tokens"]);
        expect(readThemePrefs("b").excluded).toEqual(["stax"]);

        writeThemePrefs("a", DEFAULT_THEME_PREFS);
        expect(readThemePrefs("a")).toEqual(DEFAULT_THEME_PREFS);
        expect(readThemePrefs("b").excluded).toEqual(["stax"]);
    });

    test("one click walks a theme neutral -> pinned -> excluded -> neutral", () => {
        let prefs = DEFAULT_THEME_PREFS;
        prefs = cycleTheme(prefs, "tokens");
        expect(themeState(prefs, "tokens")).toBe("pinned");
        prefs = cycleTheme(prefs, "tokens");
        expect(themeState(prefs, "tokens")).toBe("excluded");
        prefs = cycleTheme(prefs, "tokens");
        expect(themeState(prefs, "tokens")).toBe("neutral");
    });

    test("a theme in both lists keeps the pin, as the service resolves it", () => {
        writeThemePrefs("a", { pinned: ["tokens"], excluded: ["tokens", "stax"] });
        const prefs = readThemePrefs("a");

        expect(prefs.pinned).toEqual(["tokens"]);
        expect(prefs.excluded).toEqual(["stax"]);
    });

    test("drops malformed stored values rather than trusting them", () => {
        values.set("cardlens.deck-themes.v1", JSON.stringify({ a: { pinned: ["ok", 7], excluded: "nope" } }));
        expect(readThemePrefs("a")).toEqual({ pinned: ["ok"], excluded: [] });

        values.set("cardlens.deck-themes.v1", "not json");
        expect(readThemePrefs("a")).toEqual(DEFAULT_THEME_PREFS);
    });

    test("pruning retires themes the service no longer knows", () => {
        const prefs = { pinned: ["tokens", "gone"], excluded: ["stax"] };

        expect(pruneThemePrefs(prefs, ["tokens", "stax"])).toEqual({ pinned: ["tokens"], excluded: ["stax"] });
    });

    test("the request key ignores order, so reordering is not a new request", () => {
        const one = { pinned: ["a", "b"], excluded: ["c"] };
        const other = { pinned: ["b", "a"], excluded: ["c"] };

        expect(themePrefsKey(one)).toBe(themePrefsKey(other));
        expect(themePrefsKey(one)).not.toBe(themePrefsKey({ pinned: ["a"], excluded: ["c"] }));
    });
});
