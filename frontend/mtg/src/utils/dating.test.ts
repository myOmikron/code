import { describe, expect, it } from "vitest";
import {
    LINE_VARIANTS,
    colorFilter,
    lineVariant,
    manaSymbols,
    matchKey,
    rejectionKey,
    swipeDirection,
} from "src/utils/dating";

describe("swipeDirection", () => {
    it("snaps back after a short drag", () => {
        expect(swipeDirection({ x: 40, y: -20 }, { x: 0, y: 0 })).toBeNull();
    });

    it("reads a long drag sideways", () => {
        expect(swipeDirection({ x: 140, y: 10 }, { x: 0, y: 0 })).toBe("right");
        expect(swipeDirection({ x: -140, y: 10 }, { x: 0, y: 0 })).toBe("left");
    });

    it("counts a quick flick as a swipe", () => {
        expect(swipeDirection({ x: 30, y: 0 }, { x: 900, y: 0 })).toBe("right");
    });

    it("reads mostly upwards as a super like", () => {
        expect(swipeDirection({ x: 40, y: -160 }, { x: 0, y: 0 })).toBe("up");
        expect(swipeDirection({ x: 200, y: -160 }, { x: 0, y: 0 })).toBe("right");
    });
});

describe("lines", () => {
    it("keeps the same variant for the same Commander", () => {
        expect(lineVariant("atraxa")).toBe(lineVariant("atraxa"));
        expect(lineVariant("atraxa")).toBeGreaterThanOrEqual(1);
        expect(lineVariant("atraxa")).toBeLessThanOrEqual(LINE_VARIANTS);
    });

    it("names a rejection by dimension and direction", () => {
        const key = rejectionKey({ dimension: "Salt", direction: "More" }, "toxrill");
        expect(key).toMatch(/^description\.reject-salt-more-[1-3]$/);
    });

    it("leaves the direction out where there is none", () => {
        const key = rejectionKey({ dimension: "Themes", detail: "Aristocrats" }, "meren");
        expect(key).toMatch(/^description\.reject-themes-[1-3]$/);
    });

    it("names a match line", () => {
        expect(matchKey("krenko")).toMatch(/^description\.match-[1-3]$/);
    });
});

describe("colors", () => {
    it("draws letters as mana symbols", () => {
        expect(manaSymbols("RB")).toBe("{R}{B}");
    });

    it("sends no filter for none or all colors", () => {
        expect(colorFilter(new Set())).toBeNull();
        expect(colorFilter(new Set(["W", "U", "B", "R", "G"] as const))).toBeNull();
    });

    it("sends the chosen colors in WUBRG order", () => {
        expect(colorFilter(new Set(["G", "W"] as const))).toBe("WG");
    });
});
