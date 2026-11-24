import { describe, expect, test } from "vitest";
import { SuggestionGroup } from "src/api/graph-generated";
import { cedhGroupOrder, modeDiff } from "src/utils/advisor-moves";

/**
 * A minimal group, everything the reorder never reads left blank
 *
 * @param key the group's key
 *
 * @returns the group
 */
function group(key: string): SuggestionGroup {
    return { key, label: key, reason: "", suggestions: [] };
}

describe("cedhGroupOrder", () => {
    test("moves combo and bucket:interaction to the front, in that order", () => {
        const groups = [group("bucket:ramp"), group("staples"), group("bucket:interaction"), group("combo")];
        expect(cedhGroupOrder(groups).map((g) => g.key)).toEqual([
            "combo",
            "bucket:interaction",
            "bucket:ramp",
            "staples",
        ]);
    });

    test("keeps every other group in the server's own order", () => {
        const groups = [group("theme:aggro"), group("resource:treasure"), group("staples")];
        expect(cedhGroupOrder(groups).map((g) => g.key)).toEqual(["theme:aggro", "resource:treasure", "staples"]);
    });

    test("a report with neither lead group is unchanged", () => {
        const groups = [group("bucket:ramp"), group("staples")];
        expect(cedhGroupOrder(groups).map((g) => g.key)).toEqual(["bucket:ramp", "staples"]);
    });

    test("a report with only one lead group promotes just that one", () => {
        const groups = [group("bucket:ramp"), group("combo"), group("staples")];
        expect(cedhGroupOrder(groups).map((g) => g.key)).toEqual(["combo", "bucket:ramp", "staples"]);
    });
});

describe("modeDiff", () => {
    test("auto keeps the real count", () => {
        expect(modeDiff("auto", -12)).toBe(-12);
        expect(modeDiff("auto", 0)).toBe(0);
        expect(modeDiff("auto", 3)).toBe(3);
    });

    test("a picked mode overrides the count", () => {
        expect(modeDiff("add", 4)).toBeLessThan(0);
        expect(modeDiff("cut", -20)).toBeGreaterThan(0);
        expect(modeDiff("swap", -20)).toBe(0);
    });
});
