import { describe, expect, it } from "vitest";
import de from "src/assets/dating-lines/de.json";
import en from "src/assets/dating-lines/en.json";
import { pickLine } from "src/utils/dating-lines";
import type { DatingLines } from "src/utils/dating-lines";

describe("dating lines", () => {
    it("has the same Commanders in both languages", () => {
        expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    });

    it("gives every Commander a full set of lines", () => {
        for (const lines of [en, de] as Array<DatingLines>) {
            for (const [name, commander] of Object.entries(lines)) {
                expect(commander.tagline, name).not.toBe("");
                expect(commander.comeback, name).not.toBe("");
                expect(commander.match, name).toHaveLength(2);
                expect(commander.reject, name).toHaveLength(2);
            }
        }
    });

    it("keeps em dashes out of every line", () => {
        expect(JSON.stringify([en, de])).not.toContain("—");
    });
});

describe("pickLine", () => {
    it("falls back without lines", () => {
        expect(pickLine(undefined, "x")).toBeNull();
        expect(pickLine([], "x")).toBeNull();
    });

    it("picks the same line for the same Commander", () => {
        const lines = ["a", "b"];
        expect(pickLine(lines, "atraxa")).toBe(pickLine(lines, "atraxa"));
        expect(lines).toContain(pickLine(lines, "atraxa"));
    });
});
