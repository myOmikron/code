import { beforeAll, describe, expect, test } from "vitest";
import { SuggestionGroup } from "src/api/graph-generated";

// Same reason `deck-advisor-setup.test.ts` stubs `window` before importing:
// this component pulls in `src/api/graph.ts` transitively (through
// `deck-advisor-card-dialog` → the printing/replace machinery), which reads
// `window.location.origin` at module scope — harmless in the browser, fatal
// under vitest's plain Node environment without this.
(globalThis as { window?: unknown }).window ??= { location: { origin: "http://localhost" } };

let cedhGroupOrder: (groups: ReadonlyArray<SuggestionGroup>) => Array<SuggestionGroup>;

beforeAll(async () => {
    ({ cedhGroupOrder } = await import("src/components/deck-advisor-suggestions"));
});

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
