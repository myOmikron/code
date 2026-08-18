import { describe, expect, it } from "vitest";
import { TAG_COLORS, TAG_ICONS, TAG_PRESET, readTagNames, tagColor, tagIcon } from "src/utils/deck-tags";

describe("readTagNames", () => {
    it("reads one name", () => {
        expect(readTagNames("  Ramp ")).toStrictEqual(["Ramp"]);
    });

    it("splits on commas and semicolons", () => {
        expect(readTagNames("Ramp, Removal; Draw")).toStrictEqual(["Ramp", "Removal", "Draw"]);
    });

    it("drops blanks and repeats", () => {
        expect(readTagNames("Ramp,,ramp, Draw ,")).toStrictEqual(["Ramp", "Draw"]);
    });

    it("reads nothing out of nothing", () => {
        expect(readTagNames("  , ; ")).toStrictEqual([]);
    });
});

describe("tagColor", () => {
    it("keeps a colour it knows", () => {
        expect(tagColor("violet")).toBe("violet");
    });

    it("falls back on anything else", () => {
        expect(tagColor("chartreuse")).toBe("zinc");
        expect(tagColor("")).toBe("zinc");
    });
});

describe("tagIcon", () => {
    it("keeps an icon it knows", () => {
        expect(tagIcon("trophy")).toBe("trophy");
    });

    it("falls back on anything else", () => {
        expect(tagIcon("dragon")).toBe("tag");
        expect(tagIcon("")).toBe("tag");
    });
});

describe("TAG_PRESET", () => {
    it("only uses colours that exist", () => {
        for (const preset of TAG_PRESET) {
            expect(TAG_COLORS).toContain(preset.color);
        }
    });

    it("only uses icons that exist", () => {
        for (const preset of TAG_PRESET) {
            expect(TAG_ICONS).toContain(preset.icon);
        }
    });

    it("names every tag once", () => {
        expect(new Set(TAG_PRESET.map((preset) => preset.name)).size).toBe(TAG_PRESET.length);
    });

    it("keeps what a card does on the account and what the deck does with it local", () => {
        expect(TAG_PRESET.filter((preset) => preset.global).map((preset) => preset.name)).toStrictEqual([
            "Card Advantage",
            "Ramp",
            "Targeted Disruption",
            "Mass Disruption",
            "Tutor",
        ]);
        expect(TAG_PRESET.filter((preset) => !preset.global).map((preset) => preset.name)).toStrictEqual([
            "Game Plan",
            "Wincon",
        ]);
    });
});
