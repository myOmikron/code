import { describe, expect, it } from "vitest";
import {
    COLORS,
    LINE_VARIANTS,
    colorFilter,
    lineVariant,
    nextColorChoice,
    manaSymbols,
    matchKey,
    pairMatchKey,
    rejectionKey,
    sortColors,
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

    it("has its own lines for a theme the player said no to", () => {
        const key = rejectionKey({ dimension: "Avoided", detail: "Tokens" }, "krenko");
        expect(key).toMatch(/^description\.reject-avoided-[1-3]$/);
    });

    it("names a match line", () => {
        expect(matchKey("krenko")).toMatch(/^description\.match-[1-3]$/);
    });
});

describe("colors", () => {
    it("draws letters as mana symbols", () => {
        expect(manaSymbols("RB")).toBe("{R}{B}");
    });

    it("sends no filter while every color is allowed", () => {
        expect(colorFilter(new Map())).toEqual({ colors: null, required: null });
    });

    it("sends the allowed and required colors in WUBRG order", () => {
        const choices = new Map([
            ["U", "excluded"],
            ["G", "required"],
            ["W", "required"],
        ] as const);
        expect(colorFilter(choices)).toEqual({ colors: "WBRG", required: "WG" });
    });

    it("sends no allowed colors when all are excluded", () => {
        const choices = new Map(COLORS.map((color) => [color, "excluded"] as const));
        expect(colorFilter(choices)).toEqual({ colors: "", required: null });
    });

    it("cycles allowed, excluded, required", () => {
        expect(nextColorChoice(undefined)).toBe("excluded");
        expect(nextColorChoice("excluded")).toBe("required");
        expect(nextColorChoice("required")).toBeUndefined();
    });
});

describe("sortColors", () => {
    it("puts a pair's colors in WUBRG order", () => {
        expect(sortColors("GR")).toBe("RG");
        expect(sortColors("")).toBe("");
    });
});

describe("pairMatchKey", () => {
    it("picks a stable pair line", () => {
        expect(pairMatchKey("giants")).toBe(pairMatchKey("giants"));
        expect(pairMatchKey("giants")).toMatch(/^description\.pair-match-[1-3]$/);
    });
});
