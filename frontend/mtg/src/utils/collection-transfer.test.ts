import { describe, expect, it, vi } from "vitest";
import type { CollectionEntryResponse, NewCollectionEntry } from "src/api/generated";

// The module under test pulls in the api client, whose setup reads `window` — absent in node.
// Only the pure fold and plan are tested here, so an empty stub is all that is needed.
vi.mock("src/api/api", () => ({ Api: {} }));
const { foldStacks, planTransfer } = await import("./collection-transfer");

const stack = (printing: string, quantity = 1, overrides: Partial<NewCollectionEntry> = {}): NewCollectionEntry => ({
    printing,
    quantity,
    condition: "NearMint",
    finish: "Nonfoil",
    purchase_price_cents: null,
    acquired_at: null,
    ...overrides,
});

const row = (
    uuid: string,
    printing: string,
    quantity: number,
    overrides: Partial<CollectionEntryResponse> = {},
): CollectionEntryResponse =>
    ({
        uuid,
        printing,
        quantity,
        condition: "NearMint",
        finish: "Nonfoil",
        purchase_price_cents: null,
        acquired_at: null,
        ...overrides,
    }) as CollectionEntryResponse;

describe("foldStacks", () => {
    it("adds up equal (printing, condition, finish) and keeps different ones apart", () => {
        const folded = foldStacks([
            stack("p1", 1),
            stack("p1", 2),
            stack("p1", 1, { finish: "Foil" }),
            stack("p1", 1, { condition: "Played" }),
            stack("p2", 1),
        ]);
        expect(folded).toHaveLength(4);
        expect(folded.find((s) => s.printing === "p1" && s.finish === "Nonfoil" && s.condition === "NearMint")).toEqual(
            stack("p1", 3),
        );
    });

    it("keeps the first entry's price and date and leaves the inputs untouched", () => {
        const first = stack("p1", 1, { purchase_price_cents: 100, acquired_at: "2026-01-01" });
        const second = stack("p1", 1, { purchase_price_cents: 999 });
        const folded = foldStacks([first, second]);
        expect(folded[0].purchase_price_cents).toBe(100);
        expect(folded[0].quantity).toBe(2);
        expect(first.quantity).toBe(1);
    });
});

describe("planTransfer", () => {
    it("tops up an existing row and files the rest fresh", () => {
        const existing = [row("e1", "p1", 2), row("e2", "p2", 1, { finish: "Foil" })];
        const { fresh, topUps } = planTransfer([stack("p1", 3), stack("p2", 1), stack("p3", 1)], existing);
        expect(topUps).toEqual([{ uuid: "e1", quantity: 5 }]);
        expect(fresh.map((s) => s.printing)).toEqual(["p2", "p3"]);
    });

    it("matches on all of printing, condition and finish", () => {
        const existing = [row("e1", "p1", 1)];
        const { fresh, topUps } = planTransfer([stack("p1", 1, { condition: "Poor" })], existing);
        expect(topUps).toHaveLength(0);
        expect(fresh).toHaveLength(1);
    });
});
