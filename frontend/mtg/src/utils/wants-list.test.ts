import { describe, expect, it } from "vitest";
import { foldMissing, wantsList } from "src/utils/wants-list";
import type { MissingCard } from "src/utils/wants-list";

/**
 * A card the deck is short of
 *
 * @param over what to change about the usual card
 *
 * @returns the entry
 */
function missing(over: Partial<MissingCard> = {}): MissingCard {
    return { key: "sol-ring", name: "Sol Ring", missing: 1, ...over };
}

describe("a cardmarket wants list", () => {
    it("writes one line per card, count first", () => {
        const text = wantsList([missing(), missing({ key: "bolt", name: "Lightning Bolt", missing: 4 })]);

        expect(text).toBe("1 Sol Ring\n4 Lightning Bolt");
    });

    it("adds up the same card from several slots", () => {
        expect(foldMissing([missing({ missing: 3 }), missing({ missing: 1 })])).toEqual([missing({ missing: 4 })]);
    });

    it("folds two editions of one card into a single want", () => {
        expect(wantsList([missing(), missing()])).toBe("2 Sol Ring");
    });

    it("leaves out what is not missing", () => {
        expect(wantsList([missing({ missing: 0 })])).toBe("");
    });

    it("keeps the order the cards were first met", () => {
        const text = wantsList([
            missing({ key: "b", name: "Beast" }),
            missing({ key: "a", name: "Ancestor" }),
            missing({ key: "b", name: "Beast" }),
        ]);

        expect(text).toBe("2 Beast\n1 Ancestor");
    });
});
