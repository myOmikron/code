import { describe, expect, it } from "vitest";
import { RoundState } from "src/api/generated";
import type { MatchResponse, RoundResponse } from "src/api/generated";
import { isChanged, isRematch, layoutFrom, meetingsBefore, moveTable, swap, toRequest } from "src/utils/pairing-edit";

/**
 * A Match or, without a table number, a Bye
 *
 * @param uuid its uuid
 * @param table its table number, `null` for a Bye
 * @param seats who sits there in Seat order
 *
 * @returns the Match as the service sends it
 */
function played(uuid: string, table: number | null, seats: Array<string>): MatchResponse {
    return {
        uuid,
        table_number: table,
        seats: seats.map((participant, index) => ({ participant, name: participant, guest: true, seat: index + 1 })),
        result: null,
        rematch: false,
    };
}

/**
 * A Round of `matches`
 *
 * @param number its number
 * @param state how far it got
 * @param matches its Matches and Byes
 *
 * @returns the Round as the service sends it
 */
function round(number: number, state: RoundState, matches: Array<MatchResponse>): RoundResponse {
    return { number, state, matches };
}

const preview = round(2, RoundState.Previewed, [
    played("m1", 1, ["a", "b"]),
    played("m2", 2, ["c", "d"]),
    played("m3", null, ["e"]),
]);

describe("layoutFrom", () => {
    it("keeps the tables in order with their Seats, Byes last", () => {
        expect(layoutFrom(preview)).toEqual([
            { key: "m1", bye: false, seats: ["a", "b"] },
            { key: "m2", bye: false, seats: ["c", "d"] },
            { key: "m3", bye: true, seats: ["e"] },
        ]);
    });
});

describe("swap", () => {
    it("trades two Participants at different tables", () => {
        const swapped = swap(layoutFrom(preview), "b", "c");
        expect(swapped.map((entry) => entry.seats)).toEqual([["a", "c"], ["b", "d"], ["e"]]);
    });

    it("hands the Bye to somebody else", () => {
        const swapped = swap(layoutFrom(preview), "e", "a");
        expect(swapped.map((entry) => entry.seats)).toEqual([["e", "b"], ["c", "d"], ["a"]]);
    });

    it("trades the Seats of one Match", () => {
        const swapped = swap(layoutFrom(preview), "a", "b");
        expect(swapped[0].seats).toEqual(["b", "a"]);
    });

    it("leaves the layout as it is for somebody not in it", () => {
        const layout = layoutFrom(preview);
        expect(swap(layout, "a", "z")).toBe(layout);
    });
});

describe("moveTable", () => {
    it("moves a Match one table up or down", () => {
        const layout = layoutFrom(preview);
        expect(moveTable(layout, 1, -1).map((entry) => entry.key)).toEqual(["m2", "m1", "m3"]);
        expect(moveTable(layout, 0, 1).map((entry) => entry.key)).toEqual(["m2", "m1", "m3"]);
    });

    it("never moves a Match past the first table or onto the Byes", () => {
        const layout = layoutFrom(preview);
        expect(moveTable(layout, 0, -1)).toBe(layout);
        expect(moveTable(layout, 1, 1)).toBe(layout);
        expect(moveTable(layout, 2, -1)).toBe(layout);
    });
});

describe("isChanged", () => {
    it("tells an edited layout from the one it started as", () => {
        const layout = layoutFrom(preview);
        expect(isChanged(layout, layout)).toBe(false);
        expect(isChanged(layout, swap(layout, "a", "b"))).toBe(true);
        expect(isChanged(layout, swap(swap(layout, "a", "c"), "a", "c"))).toBe(false);
        expect(isChanged(layout, moveTable(layout, 0, 1))).toBe(true);
    });
});

describe("meetingsBefore and isRematch", () => {
    const rounds = [
        round(1, RoundState.Ended, [
            played("r1", 1, ["a", "c"]),
            played("r2", 2, ["b", "d"]),
            played("r3", null, ["e"]),
        ]),
        preview,
    ];

    it("counts the Matches of earlier Rounds only", () => {
        const met = meetingsBefore(rounds, 2);
        expect(isRematch(["c", "a"], met)).toBe(true);
        expect(isRematch(["a", "b"], met)).toBe(false);
        expect(isRematch(["a", "b"], meetingsBefore(rounds, 3))).toBe(true);
    });

    it("never counts a Bye as a meeting", () => {
        expect(isRematch(["e", "a"], meetingsBefore(rounds, 2))).toBe(false);
    });
});

describe("toRequest", () => {
    it("sends the Matches in table order and the Byes", () => {
        const layout = moveTable(swap(layoutFrom(preview), "e", "d"), 1, -1);
        expect(toRequest(layout)).toEqual({
            matches: [
                ["c", "e"],
                ["a", "b"],
            ],
            byes: ["d"],
        });
    });
});
