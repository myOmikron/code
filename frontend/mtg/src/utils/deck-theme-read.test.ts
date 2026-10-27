import { describe, expect, test } from "vitest";
import { Diagnostics, ThemeShare } from "src/api/graph-generated";
import { DEFAULT_THEME_PREFS, ThemePrefs } from "src/utils/deck-theme-prefs";
import { themeListFloor, themeListing } from "src/utils/deck-theme-read";

/**
 * The smallest report the listing looks at
 *
 * @param themes the detected themes, in the service's own order (by share)
 * @param over how big the deck is, and how much of it is land
 *
 * @returns the report
 */
function report(
    themes: Array<Partial<ThemeShare>>,
    over = { deck_size: 99, lands: 38, themed_cards: 34 },
): Diagnostics {
    return {
        ...over,
        themes: themes.map((theme) => ({ theme: "x", label: "X", share: 0, cards: 0, ...theme })),
    } as Diagnostics;
}

describe("themeListFloor", () => {
    test("six cards, or a tenth of the spells when that is more", () => {
        expect(themeListFloor(61)).toBe(7);
        expect(themeListFloor(40)).toBe(6);
        expect(themeListFloor(200)).toBe(20);
        expect(themeListFloor(0)).toBe(6);
    });
});

describe("themeListing", () => {
    test("lists the themes the deck is behind and footnotes the rest", () => {
        const listing = themeListing(
            report([
                { theme: "landfall", label: "Landfall", share: 0.4, cards: 22 },
                { theme: "counters", label: "+1/+1 counters", share: 0.1, cards: 2 },
                { theme: "big_spells", label: "Big spells", share: 0.2, cards: 9 },
                { theme: "tribal", label: "Typal", share: 0.1, cards: 4 },
                { theme: "mill", label: "Mill", share: 0.02, cards: 1 },
            ]),
            DEFAULT_THEME_PREFS,
        );

        expect(listing.listed.map((row) => row.id)).toEqual(["landfall", "big_spells"]);
        expect(listing.faint.map((row) => row.id)).toEqual(["tribal", "counters"]);
        expect(listing.spells).toBe(61);
        expect(listing.themed).toBe(34);
    });

    test("orders by the cards behind a theme, not by its share", () => {
        // The Shorikai case: the commander anchor puts Vehicles on top of the
        // distribution off seven cards, while nineteen cards read as
        // reanimator. The deck is the reanimator deck.
        const listing = themeListing(
            report([
                { theme: "vehicles", label: "Vehicles", share: 0.34, cards: 7 },
                { theme: "reanimator", label: "Reanimator", share: 0.24, cards: 19 },
                { theme: "untap_combo", label: "Untap combo", share: 0.1, cards: 10 },
            ]),
            DEFAULT_THEME_PREFS,
        );

        expect(listing.listed.map((row) => row.id)).toEqual(["reanimator", "untap_combo", "vehicles"]);
    });

    test("a theme the reader set a level for is listed however faint it is", () => {
        const prefs: ThemePrefs = { levels: { tutors: "light", tokens: "avoid" } };
        const listing = themeListing(
            report([
                { theme: "landfall", label: "Landfall", share: 0.5, cards: 22 },
                { theme: "tutors", label: "Tutors", share: 0.05, cards: 3 },
            ]),
            prefs,
            { tokens: "Tokens" },
        );

        expect(listing.listed.map((row) => [row.id, row.cards, row.confident])).toEqual([
            ["landfall", 22, true],
            ["tutors", 3, false],
            ["tokens", 0, false],
        ]);
        expect(listing.listed[2].label).toBe("Tokens");
        expect(listing.faint).toEqual([]);
    });

    test("a levelled theme the report has forgotten is named from its id when nothing else knows it", () => {
        const listing = themeListing(report([]), { levels: { untap_combo: "core" } });

        expect(listing.listed).toEqual([{ id: "untap_combo", label: "untap combo", cards: 0, confident: false }]);
    });

    test("a report without card counts lists nothing rather than everything", () => {
        const listing = themeListing(
            report([{ theme: "tokens", label: "Tokens", share: 0.9, cards: undefined }]),
            DEFAULT_THEME_PREFS,
        );

        expect(listing.listed).toEqual([]);
        expect(listing.faint).toEqual([]);
    });
});
