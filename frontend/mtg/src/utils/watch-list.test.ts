import { describe, expect, it } from "vitest";
import {
    countEntry,
    entryState,
    matchesLens,
    nextFinish,
    offeredFinishes,
    pinnedFinish,
    sortEntries,
} from "src/utils/watch-list";
import type { WatchedEntryLike } from "src/utils/watch-list";

/**
 * An entry with both switches on and nothing on the shelf
 *
 * @param over what this case changes about it
 *
 * @returns the entry to count
 */
function entry(
    over: Omit<Partial<WatchedEntryLike>, "stock"> & { stock?: Partial<WatchedEntryLike["stock"]> } = {},
): WatchedEntryLike {
    return {
        exact_printing: true,
        match_finish: true,
        wanted: 1,
        triggered_at: null,
        acknowledged: false,
        ...over,
        stock: {
            free: 0,
            sleeved: 0,
            free_any_printing: 0,
            free_any_finish: 0,
            ...over.stock,
        },
    };
}

describe("countEntry", () => {
    it("reads the line the row shows", () => {
        const count = countEntry(
            entry({ wanted: 4, stock: { free: 2, sleeved: 12, free_any_printing: 2, free_any_finish: 2 } }),
        );
        expect(count.free).toBe(2);
        expect(count.sleeved).toBe(12);
        expect(count.total).toBe(14);
        expect(count.missing).toBe(2);
    });

    it("does not count sleeved copies against what is still missing", () => {
        const count = countEntry(entry({ wanted: 4, stock: { free: 0, sleeved: 9 } }));
        expect(count.missing).toBe(4);
    });

    it("reports what the switches are turning away", () => {
        const count = countEntry(entry({ stock: { free: 1, free_any_printing: 4, free_any_finish: 3 } }));
        expect(count.otherPrinting).toBe(3);
        expect(count.otherFinish).toBe(2);
    });

    it("turns nothing away through a switch that is already open", () => {
        const count = countEntry(
            entry({
                exact_printing: false,
                match_finish: false,
                stock: { free: 4, free_any_printing: 4, free_any_finish: 4 },
            }),
        );
        expect(count.otherPrinting).toBe(0);
        expect(count.otherFinish).toBe(0);
    });

    it("never reports a negative surplus", () => {
        const count = countEntry(entry({ stock: { free: 3, free_any_printing: 0, free_any_finish: 0 } }));
        expect(count.otherPrinting).toBe(0);
        expect(count.otherFinish).toBe(0);
    });
});

describe("countEntry meter", () => {
    it("fills the bar with the free copies and ghosts the sleeved ones behind them", () => {
        const count = countEntry(entry({ wanted: 4, stock: { free: 1, sleeved: 2 } }));
        expect(count.freeShare).toBe(25);
        expect(count.sleevedShare).toBe(50);
    });

    it("never fills past the end of the bar", () => {
        const count = countEntry(entry({ wanted: 2, stock: { free: 9, sleeved: 9 } }));
        expect(count.freeShare).toBe(100);
        expect(count.sleevedShare).toBe(0);
    });

    it("keeps a bar for an entry that wants nothing recorded", () => {
        const count = countEntry(entry({ wanted: 0, stock: { free: 1 } }));
        expect(count.freeShare).toBe(100);
    });
});

describe("entryState", () => {
    const cheapEnough = { triggered_at: "2026-08-27T12:00:00Z", acknowledged: false };

    it("puts an unread alarm above everything else", () => {
        expect(entryState(entry({ ...cheapEnough, wanted: 1, stock: { free: 4 } }))).toBe("alarm");
    });

    it("calls an entry complete once the free copies cover it", () => {
        expect(entryState(entry({ wanted: 2, stock: { free: 2 } }))).toBe("complete");
    });

    it("keeps a seen alarm apart from a plain hunt", () => {
        expect(entryState(entry({ ...cheapEnough, acknowledged: true, wanted: 2 }))).toBe("cheap");
        expect(entryState(entry({ wanted: 2 }))).toBe("hunting");
    });

    it("does not call an entry complete on sleeved copies alone", () => {
        expect(entryState(entry({ wanted: 2, stock: { free: 0, sleeved: 8 } }))).toBe("hunting");
    });
});

describe("matchesLens", () => {
    it("shows everything under the open lens", () => {
        expect(matchesLens(entry(), "all")).toBe(true);
    });

    it("gathers both flavours of alarm under one lens", () => {
        expect(
            matchesLens(entry({ triggered_at: "2026-08-27T12:00:00Z", acknowledged: false, wanted: 2 }), "alarm"),
        ).toBe(true);
        expect(
            matchesLens(entry({ triggered_at: "2026-08-27T12:00:00Z", acknowledged: true, wanted: 2 }), "alarm"),
        ).toBe(true);
        expect(matchesLens(entry({ wanted: 2 }), "alarm")).toBe(false);
    });

    it("splits what is still missing from what is done", () => {
        const done = entry({ wanted: 1, stock: { free: 1 } });
        expect(matchesLens(done, "complete")).toBe(true);
        expect(matchesLens(done, "missing")).toBe(false);
        expect(matchesLens(entry({ wanted: 3, stock: { free: 1 } }), "missing")).toBe(true);
    });
});

describe("offeredFinishes", () => {
    it("offers only what the print was made in", () => {
        expect(offeredFinishes("Nonfoil", "nonfoil,foil")).toEqual(["Nonfoil", "Foil"]);
        expect(offeredFinishes("Nonfoil", "nonfoil")).toEqual(["Nonfoil"]);
    });

    it("keeps offering what the entry already names", () => {
        expect(offeredFinishes("Etched", "nonfoil")).toEqual(["Nonfoil", "Etched"]);
    });
});

describe("nextFinish", () => {
    const pinned = { exact_printing: true, match_finish: false, finish: "Nonfoil" };

    it("steps from any into the first finish the print has", () => {
        expect(nextFinish(pinned, "nonfoil,foil")).toEqual({ match_finish: true, finish: "Nonfoil" });
    });

    it("steps along the finishes the print has", () => {
        expect(nextFinish({ ...pinned, match_finish: true }, "nonfoil,foil")).toEqual({ finish: "Foil" });
    });

    it("comes back round to any after the last one", () => {
        expect(nextFinish({ ...pinned, match_finish: true, finish: "Foil" }, "nonfoil,foil")).toEqual({
            match_finish: false,
        });
    });

    it("does nothing on a row that accepts any version", () => {
        expect(nextFinish({ ...pinned, exact_printing: false }, "nonfoil,foil")).toBeNull();
    });
});

describe("sortEntries", () => {
    const row = (uuid: string, name: string, price: number | null, wanted = 1, free = 0) => ({
        ...entry({ wanted, stock: { free } }),
        uuid,
        card: { name },
        market: price === null ? null : { price_cents: price },
    });

    it("orders by name in both directions", () => {
        const rows = [row("c", "Sol Ring", 100), row("a", "Arcane Signet", 100)];
        expect(sortEntries(rows, "name", false).map((placed) => placed.card.name)).toEqual([
            "Arcane Signet",
            "Sol Ring",
        ]);
        expect(sortEntries(rows, "name", true).map((placed) => placed.card.name)).toEqual([
            "Sol Ring",
            "Arcane Signet",
        ]);
    });

    it("orders by what is still missing", () => {
        const rows = [row("a", "A", 100, 4, 4), row("b", "B", 100, 4, 1)];
        expect(sortEntries(rows, "missing", true).map((placed) => placed.uuid)).toEqual(["b", "a"]);
    });

    it("sinks unpriced rows to the bottom whichever way the arrow points", () => {
        const rows = [row("a", "A", null), row("b", "B", 500), row("c", "C", 100)];
        expect(sortEntries(rows, "price", false).map((placed) => placed.uuid)).toEqual(["c", "b", "a"]);
        expect(sortEntries(rows, "price", true).map((placed) => placed.uuid)).toEqual(["b", "c", "a"]);
    });

    it("leaves the given array alone", () => {
        const rows = [row("b", "B", 100), row("a", "A", 100)];
        sortEntries(rows, "name", false);
        expect(rows.map((placed) => placed.uuid)).toEqual(["b", "a"]);
    });
});

describe("pinnedFinish", () => {
    it("reports the finish only while it is in force", () => {
        expect(pinnedFinish({ exact_printing: true, match_finish: true, finish: "Foil" })).toBe("Foil");
    });

    it("reports nothing where the row takes any finish", () => {
        expect(pinnedFinish({ exact_printing: true, match_finish: false, finish: "Foil" })).toBeNull();
    });

    it("reports nothing where the row takes any version", () => {
        expect(pinnedFinish({ exact_printing: false, match_finish: true, finish: "Foil" })).toBeNull();
    });
});
