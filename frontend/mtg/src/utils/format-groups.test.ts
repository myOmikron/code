import { describe, expect, it } from "vitest";
import { formatEntries, formatGroup } from "src/utils/format-groups";

/**
 * Names a format the way the picker shows it, Duel Commander by its full name
 *
 * @param slug the format
 * @returns its name
 */
function name(slug: string): string {
    return slug === "duel" ? "Duel Commander" : slug.charAt(0).toUpperCase() + slug.slice(1);
}

describe("formatGroup", () => {
    it("lists the sanctioned and the Limited formats as commonly played", () => {
        for (const slug of ["commander", "modern", "draft", "sealed"]) expect(formatGroup(slug)).toBe("popular");
    });

    it("lists everything else as rarely played", () => {
        for (const slug of ["predh", "penny", "tlr", "unknown"]) expect(formatGroup(slug)).toBe("rare");
    });
});

describe("formatEntries", () => {
    it("heads each group and sorts it by name", () => {
        const entries = formatEntries(["tlr", "modern", "predh", "draft", "duel"], name);

        expect(entries).toEqual([
            { kind: "heading", slug: "heading:popular", group: "popular" },
            { kind: "format", slug: "draft", name: "Draft" },
            { kind: "format", slug: "duel", name: "Duel Commander" },
            { kind: "format", slug: "modern", name: "Modern" },
            { kind: "heading", slug: "heading:rare", group: "rare" },
            { kind: "format", slug: "predh", name: "Predh" },
            { kind: "format", slug: "tlr", name: "Tlr" },
        ]);
    });

    it("narrows to the names matching the query, case ignored", () => {
        const entries = formatEntries(["modern", "predh", "duel"], name, " COMM ");

        expect(entries).toEqual([
            { kind: "heading", slug: "heading:popular", group: "popular" },
            { kind: "format", slug: "duel", name: "Duel Commander" },
        ]);
    });

    it("drops a group's heading with its last match", () => {
        expect(formatEntries(["modern", "predh"], name, "pre")).toEqual([
            { kind: "heading", slug: "heading:rare", group: "rare" },
            { kind: "format", slug: "predh", name: "Predh" },
        ]);
        expect(formatEntries(["modern", "predh"], name, "zzz")).toEqual([]);
    });
});
