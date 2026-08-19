import { describe, expect, it } from "vitest";
import { canBeCommander } from "src/utils/commander";

describe("canBeCommander", () => {
    it("accepts legendary creatures", () => {
        expect(canBeCommander({ typeLine: "Legendary Creature — Human Wizard", oracleText: "" })).toBe(true);
    });

    it("accepts legendary Backgrounds", () => {
        expect(canBeCommander({ typeLine: "Legendary Enchantment — Background", oracleText: "" })).toBe(true);
    });

    it("accepts cards whose rules text grants the permission", () => {
        expect(
            canBeCommander({
                typeLine: "Legendary Planeswalker — Jeska",
                oracleText: "Jeska, Thrice Reborn can be your commander.",
            }),
        ).toBe(true);
    });

    it("rejects other cards", () => {
        expect(canBeCommander({ typeLine: "Creature — Bear", oracleText: "" })).toBe(false);
        expect(canBeCommander({ typeLine: "Legendary Artifact", oracleText: "Indestructible" })).toBe(false);
    });
});
