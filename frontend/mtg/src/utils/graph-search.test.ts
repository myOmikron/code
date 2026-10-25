import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphApi } from "src/api/graph";
import type { SearchResult } from "src/api/graph-generated";
import { EMPTY_GRAPH_FILTERS, searchGraphPrintings } from "src/utils/graph-search";
import { resolveLookups } from "src/utils/printing-catalog";
import { Printing, resolvePrintings } from "src/utils/scryfall";

vi.mock("src/api/graph", () => ({ GraphApi: { search: vi.fn() } }));
vi.mock("src/utils/printing-catalog", () => ({ resolveLookups: vi.fn() }));
vi.mock("src/utils/scryfall", async (original) => ({
    ...(await original<typeof import("src/utils/scryfall")>()),
    resolvePrintings: vi.fn(),
}));

/**
 * A graph hit as the service answers it
 *
 * @param name the card's name
 * @param scryfallId the printing the graph picked, `null` for none
 *
 * @returns the hit
 */
const hit = (name: string, scryfallId: string | null): SearchResult =>
    ({ oracle_id: `oracle-${name}`, scryfall_id: scryfallId, name }) as SearchResult;

beforeEach(() => {
    vi.mocked(resolvePrintings).mockImplementation(
        async (ids) => new Map(ids.map((id) => [id, { id, name: id } as Printing])),
    );
});

describe("searchGraphPrintings", () => {
    it("answers every hit with its Default printing, not the graph's printing", async () => {
        vi.mocked(GraphApi.search).mockResolvedValue({
            results: [hit("Sol Ring", "graph-sol-ring"), hit("Arcane Signet", null)],
            count: 2,
        });
        vi.mocked(resolveLookups).mockImplementation(async (lookups) =>
            lookups.map((lookup) => ({ id: `default-${lookup.name}` }) as never),
        );

        const printings = await searchGraphPrintings(
            { ...EMPTY_GRAPH_FILTERS, roles: ["ramp"] },
            "",
            undefined,
            new AbortController().signal,
        );

        expect(vi.mocked(resolveLookups).mock.calls[0]?.[0]).toEqual([{ name: "Sol Ring" }, { name: "Arcane Signet" }]);
        expect(printings.map((printing) => printing.id)).toEqual(["default-Sol Ring", "default-Arcane Signet"]);
    });

    it("keeps the graph's printing for a hit the catalog cannot place by name, drops one with neither", async () => {
        vi.mocked(GraphApi.search).mockResolvedValue({
            results: [hit("Sol Ring", "graph-sol-ring"), hit("Unknown Card", null)],
            count: 2,
        });
        vi.mocked(resolveLookups).mockResolvedValue([null, null]);

        const printings = await searchGraphPrintings(
            { ...EMPTY_GRAPH_FILTERS, roles: ["ramp"] },
            "",
            undefined,
            new AbortController().signal,
        );

        expect(printings.map((printing) => printing.id)).toEqual(["graph-sol-ring"]);
    });
});
