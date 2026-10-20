import { describe, expect, it } from "vitest";
import type { EditLayout } from "src/utils/pairing-edit";
import { canMove, isRematch, move, movedPins, movedPlayers, swap, toRequest } from "src/utils/pairing-edit";

/** A duel round: two tables, one of them reported, and a bye */
const duels = (): EditLayout => ({
    tables: [
        { key: "t1", number: 1, isBye: false, locked: true, seats: ["anna", "ben"] },
        { key: "t2", number: 2, isBye: false, locked: false, seats: ["clara", "david"] },
        { key: "t3", number: 3, isBye: false, locked: false, seats: ["eva", "finn"] },
        { key: "bye", number: 0, isBye: true, locked: false, seats: ["ilse"] },
    ],
    tray: ["jonas"],
});

/** A pod round: one full pod and two short ones */
const pods = (): EditLayout => ({
    tables: [
        { key: "p1", number: 1, isBye: false, locked: false, seats: ["a", "b", "c", "d"] },
        { key: "p2", number: 2, isBye: false, locked: false, seats: ["e", "f", "g"] },
        { key: "p3", number: 3, isBye: false, locked: true, seats: ["h", "i", "j"] },
    ],
    tray: [],
});

describe("swap", () => {
    it("trades two players between tables, each taking the other's seat", () => {
        const next = swap(duels(), "clara", "finn");
        expect(next.tables[1].seats).toEqual(["finn", "david"]);
        expect(next.tables[2].seats).toEqual(["eva", "clara"]);
    });

    it("moves the bye with the player who had it", () => {
        const next = swap(duels(), "ilse", "david");
        expect(next.tables[3].seats).toEqual(["david"]);
        expect(next.tables[1].seats).toEqual(["clara", "ilse"]);
    });

    it("trades a seated player with one from the tray", () => {
        const next = swap(duels(), "jonas", "eva");
        expect(next.tables[2].seats).toEqual(["jonas", "finn"]);
        expect(next.tray).toEqual(["eva"]);
    });

    it("leaves a reported table alone", () => {
        const layout = duels();
        expect(swap(layout, "anna", "clara")).toBe(layout);
    });
});

describe("move", () => {
    it("takes a player from a full pod to a short one", () => {
        const next = move(pods(), "a", 1, 4);
        expect(next.tables[0].seats).toEqual(["b", "c", "d"]);
        expect(next.tables[1].seats).toEqual(["e", "f", "g", "a"]);
    });

    it("refuses to leave a short pod shorter", () => {
        expect(canMove(pods(), "e", 0, 4)).toBe(false);
    });

    it("refuses a free seat at a reported table", () => {
        expect(canMove(pods(), "a", 2, 4)).toBe(false);
    });

    it("seats a late arrival on the bye, which turns it into a table", () => {
        const next = move(duels(), "jonas", 3, 2);
        expect(next.tables[3].seats).toEqual(["ilse", "jonas"]);
        expect(next.tray).toEqual([]);
    });

    it("never takes a player out of a duel", () => {
        expect(canMove(duels(), "clara", 3, 2)).toBe(false);
    });
});

describe("movedPlayers", () => {
    it("names exactly the two players of a swap", () => {
        const before = duels();
        expect(movedPlayers(before, swap(before, "clara", "finn"))).toEqual(new Set(["clara", "finn"]));
    });

    it("does not count a seat change inside the same table", () => {
        const before = duels();
        expect(movedPlayers(before, swap(before, "clara", "david")).size).toBe(0);
    });
});

describe("isRematch", () => {
    it("flags a table where two players met before", () => {
        const table = swap(duels(), "david", "finn").tables[1];
        expect(isRematch(table, [["finn", "clara"]])).toBe(true);
        expect(isRematch(duels().tables[1], [["finn", "clara"]])).toBe(false);
    });
});

describe("toRequest", () => {
    it("sends every table in shown order and drops an emptied one", () => {
        const layout = duels();
        layout.tables[3].seats = [];
        expect(toRequest(layout)).toEqual([
            ["anna", "ben"],
            ["clara", "david"],
            ["eva", "finn"],
        ]);
    });
});

describe("movedPins", () => {
    it("names who moves and the table they sit at instead", () => {
        const seat = (participant: string, display_name: string) => ({
            participant,
            display_name,
            seat: 1,
            games_won: 0,
            dropped: false,
        });
        const tables = [
            {
                uuid: "m1",
                table_number: 3,
                status: "Unreported" as const,
                is_bye: false,
                is_draw: false,
                games_drawn: 0,
                seats: [seat("a", "Anna"), seat("b", "Ben")],
            },
        ];
        expect(movedPins(tables, [{ participant: "b", table_number: 5 }])).toEqual([
            { name: "Ben", table: 3, number: 5 },
        ]);
    });
});
