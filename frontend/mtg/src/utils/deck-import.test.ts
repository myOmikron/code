import { beforeEach, describe, expect, it, vi } from "vitest";
import { Api } from "src/api/api";
import type { PrintingLookupRequest, ResolvedPrintingResponse } from "src/api/generated";
import { importDecklist } from "src/utils/deck-import";
import { resolveLookups } from "src/utils/printing-catalog";

vi.mock("src/api/api", () => ({
    Api: { decks: { cards: { import: vi.fn() }, collection: { attach: vi.fn() }, sourcing: { fill: vi.fn() } } },
}));
vi.mock("src/utils/printing-catalog", () => ({ resolveLookups: vi.fn() }));

/** The finishes the catalog answers per card name */
const FINISHES: Record<string, Array<string>> = {
    "Sol Ring": ["nonfoil", "foil"],
    "Arcane Signet": ["nonfoil", "foil"],
    "Command Tower": ["nonfoil", "etched"],
    "Foil Only": ["foil"],
};

/**
 * What the catalog answers for a lookup, with only what the import reads
 *
 * @param lookup the lookup
 *
 * @returns the printing
 */
function placed(lookup: PrintingLookupRequest): ResolvedPrintingResponse {
    const name = lookup.name ?? "";
    const where = lookup.set_code === undefined ? "default" : `${lookup.set_code}-${lookup.collector_number}`;
    return { id: `${name}@${where}`, name, finishes: FINISHES[name] ?? ["nonfoil"] } as ResolvedPrintingResponse;
}

beforeEach(() => {
    vi.mocked(resolveLookups).mockReset();
    vi.mocked(resolveLookups).mockImplementation(async (lookups) => lookups.map(placed));
    vi.mocked(Api.decks.cards.import).mockReset();
    vi.mocked(Api.decks.cards.import).mockResolvedValue({ added: 0 } as never);
});

/**
 * Imports a decklist and answers the cards it sent
 *
 * @param text the pasted list
 *
 * @returns the cards of the import request
 */
async function imported(text: string) {
    await importDecklist("deck", text);
    return vi.mocked(Api.decks.cards.import).mock.calls[0]?.[1].cards;
}

describe("importDecklist", () => {
    it("files a card named alone as non-foil when its printing exists without foil", async () => {
        expect(await imported("1 Sol Ring")).toEqual([{ printing: "Sol Ring@default", quantity: 1, zone: "Main" }]);
    });

    it("files a card named alone as foil when its printing exists only in foil", async () => {
        expect(await imported("1 Foil Only")).toEqual([
            { printing: "Foil Only@default", quantity: 1, zone: "Main", foil: true },
        ]);
    });

    it("keeps a foil marker's set and number in the lookup and files the card as foil", async () => {
        const cards = await imported("1 Arcane Signet (ELD) 331 *F*\n1 Command Tower (CMR) 350 *E*");

        expect(vi.mocked(resolveLookups).mock.calls[0]?.[0]).toEqual([
            { name: "Arcane Signet", set_code: "ELD", collector_number: "331" },
            { name: "Command Tower", set_code: "CMR", collector_number: "350" },
        ]);
        expect(cards).toEqual([
            { printing: "Arcane Signet@ELD-331", quantity: 1, zone: "Main", foil: true },
            { printing: "Command Tower@CMR-350", quantity: 1, zone: "Main", foil: true },
        ]);
    });

    it("files a foil marker on a card named alone as foil", async () => {
        expect(await imported("1 Sol Ring *F*")).toEqual([
            { printing: "Sol Ring@default", quantity: 1, zone: "Main", foil: true },
        ]);
    });
});
