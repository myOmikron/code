import { describe, expect, test } from "vitest";
import { Diagnostics, ThemeShare } from "src/api/graph-generated";
import { themeRead } from "src/utils/deck-theme-read";

/**
 * The smallest report the theme read looks at
 *
 * @param themes the detected themes, in the service's own order (by share)
 * @param over how big the deck is, and how much of it is land
 *
 * @returns the report
 */
function report(
    themes: Array<Partial<ThemeShare>>,
    over = { deck_size: 99, lands: 33, themed_cards: 40 },
): Diagnostics {
    return {
        ...over,
        themes: themes.map((theme) => ({ theme: "x", label: "X", share: 0, cards: 0, ...theme })),
    } as Diagnostics;
}

describe("themeRead", () => {
    test("orders by the cards behind a theme, not by its share", () => {
        // The Shorikai case: the commander anchor puts Vehicles on top of the
        // distribution off seven cards, while nineteen cards read as
        // reanimator. The deck is the reanimator deck.
        const read = themeRead(
            report([
                { theme: "vehicles", label: "Vehicles", share: 0.34, cards: 7 },
                { theme: "reanimator", label: "Reanimator", share: 0.24, cards: 19 },
                { theme: "untap_combo", label: "Untap combo", share: 0.1, cards: 10 },
            ]),
        );

        expect(read.axes.map((axis) => axis.id)).toEqual(["reanimator", "untap_combo", "vehicles"]);
        expect(read.level).toBe("clear");
    });

    test("a confident share off a handful of cards is not a reading", () => {
        const read = themeRead(
            report([
                { theme: "vehicles", label: "Vehicles", share: 0.61, cards: 4 },
                { theme: "tokens", label: "Tokens", share: 0.39, cards: 3 },
            ]),
        );

        expect(read.level).toBe("weak");
    });

    test("nothing but noise reads as no theme at all", () => {
        expect(themeRead(report([{ theme: "tokens", share: 0.9, cards: 2 }])).level).toBe("none");
        expect(themeRead(report([])).level).toBe("none");
        expect(themeRead(report([])).axes).toEqual([]);
    });

    test("themes carried by a card or two never reach an axis", () => {
        const read = themeRead(
            report([
                { theme: "tokens", label: "Tokens", share: 0.5, cards: 22 },
                { theme: "mill", label: "Mill", share: 0.02, cards: 1 },
            ]),
        );

        expect(read.axes.map((axis) => axis.id)).toEqual(["tokens"]);
        // One axis is a number, not a shape.
        expect(read.shape).toBe(false);
        expect(read.level).toBe("clear");
    });

    test("a shape needs three axes", () => {
        const three = themeRead(
            report([
                { theme: "a", share: 0.4, cards: 20 },
                { theme: "b", share: 0.3, cards: 15 },
                { theme: "c", share: 0.3, cards: 12 },
            ]),
        );

        expect(three.shape).toBe(true);
        expect(three.axes).toHaveLength(3);
    });

    test("at most six axes, and the evidence is counted against the spells", () => {
        const read = themeRead(
            report(
                Array.from({ length: 9 }, (_, index) => ({ theme: `t${index}`, share: 0.1, cards: 20 - index })),
                { deck_size: 100, lands: 36, themed_cards: 51 },
            ),
        );

        expect(read.axes).toHaveLength(6);
        expect(read.themed).toBe(51);
        expect(read.spells).toBe(64);
    });

    test("a report from before the counts existed reads as no theme, never as a confident one", () => {
        const read = themeRead({
            deck_size: 99,
            lands: 33,
            themes: [{ theme: "a", label: "A", share: 0.8 }],
        } as Diagnostics);

        expect(read.level).toBe("none");
        expect(read.themed).toBe(0);
    });
});
