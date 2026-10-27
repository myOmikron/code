import { describe, expect, test } from "vitest";
import {
    DEFAULT_THEME_PREFS,
    ThemePrefs,
    normaliseThemePrefs,
    playedThemes,
    themePrefsKey,
    themeTargetCards,
    themeTargets,
    withThemeLevel,
    withThemesPicked,
} from "src/utils/deck-theme-prefs";

describe("theme preferences", () => {
    test("the played themes are every level above avoid", () => {
        let prefs = withThemeLevel(DEFAULT_THEME_PREFS, "landfall", "allin");
        prefs = withThemeLevel(prefs, "tokens", "avoid");
        prefs = withThemeLevel(prefs, "tutors", "light");

        expect(prefs.levels).toEqual({ landfall: "allin", tokens: "avoid", tutors: "light" });
        expect(playedThemes(prefs)).toEqual(["landfall", "tutors"]);
    });

    test("clearing a level forgets the theme entirely", () => {
        const prefs = withThemeLevel(withThemeLevel(DEFAULT_THEME_PREFS, "tokens", "core"), "tokens", null);

        expect(prefs).toEqual(DEFAULT_THEME_PREFS);
    });

    test("malformed storage is survived, not thrown on", () => {
        expect(normaliseThemePrefs({ tokens: "loud", blink: "core" })).toEqual({ levels: { blink: "core" } });
        expect(normaliseThemePrefs(undefined)).toEqual(DEFAULT_THEME_PREFS);
    });

    test("the wizard's picks land on core and keep a level already set", () => {
        const before: ThemePrefs = { levels: { landfall: "allin", tokens: "light", stax: "avoid" } };

        const prefs = withThemesPicked(before, ["landfall", "blink"]);

        expect(prefs.levels).toEqual({ landfall: "allin", blink: "core", stax: "avoid" });
    });

    test("picking an avoided theme turns it around", () => {
        const prefs = withThemesPicked({ levels: { stax: "avoid" } }, ["stax"]);

        expect(prefs.levels).toEqual({ stax: "core" });
    });

    test("the targets name every levelled theme, avoid included at zero", () => {
        const prefs: ThemePrefs = { levels: { landfall: "allin", tokens: "avoid", tutors: "light" } };

        expect(themeTargets(prefs)).toEqual({ landfall: 0.4, tokens: 0, tutors: 0.1 });
        expect(themeTargetCards("core", 61)).toBe(15);
        expect(themeTargetCards("light", 61)).toBe(6);
        expect(themeTargetCards("avoid", 61)).toBe(0);
        // A half card rounds up, the way the service's resolver does.
        expect(themeTargetCards("core", 58)).toBe(15);
    });

    test("the request key ignores order, so reordering is not a new request", () => {
        const one: ThemePrefs = { levels: { a: "core", b: "light", c: "avoid" } };
        const other: ThemePrefs = { levels: { c: "avoid", b: "light", a: "core" } };

        expect(themePrefsKey(one)).toBe(themePrefsKey(other));
        expect(themePrefsKey(one)).not.toBe(themePrefsKey(withThemeLevel(one, "b", "core")));
        expect(themePrefsKey(one)).not.toBe(themePrefsKey(withThemeLevel(one, "b", null)));
    });
});
