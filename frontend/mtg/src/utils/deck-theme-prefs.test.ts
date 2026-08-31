import { describe, expect, test } from "vitest";
import {
    DEFAULT_THEME_PREFS,
    cycleTheme,
    pruneThemePrefs,
    themePrefsKey,
    themeState,
} from "src/utils/deck-theme-prefs";

describe("theme preferences", () => {
    test("one click walks a theme neutral -> pinned -> excluded -> neutral", () => {
        let prefs = DEFAULT_THEME_PREFS;
        prefs = cycleTheme(prefs, "tokens");
        expect(themeState(prefs, "tokens")).toBe("pinned");
        prefs = cycleTheme(prefs, "tokens");
        expect(themeState(prefs, "tokens")).toBe("excluded");
        prefs = cycleTheme(prefs, "tokens");
        expect(themeState(prefs, "tokens")).toBe("neutral");
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
