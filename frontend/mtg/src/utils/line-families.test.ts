import { describe, expect, test } from "vitest";
import { LineEntry, SharedPieceWithLines } from "src/api/graph-generated";
import { lineFamilies } from "src/utils/line-families";

/**
 * A minimal line, everything the grouping never reads left blank
 *
 * @param id the line's id
 * @param cardNames the line's card names, in order
 * @param popularity how many decks play it
 * @param complete whether the line is complete
 *
 * @returns the line
 */
function line(id: string, cardNames: Array<string>, popularity: number, complete = true): LineEntry {
    return {
        id,
        cards: cardNames.map((name) => ({
            name,
            oracle_id: name,
            zones: ["B"],
            must_be_commander: false,
            in_deck: true,
        })),
        mana_needed: "",
        mana_value_needed: 0,
        identity: [],
        produces: [],
        bracket_tag: "",
        popularity,
        prerequisites: { easy: "", notable: "" },
        folds_to: [],
        complete,
        missing: [],
    };
}

/**
 * A minimal shared-piece entry
 *
 * @param name the card's name
 * @param lineIds the lines it appears in
 *
 * @returns the entry
 */
function shared(name: string, lineIds: Array<string>): SharedPieceWithLines {
    return { name, oracle_id: name, line_ids: lineIds };
}

describe("lineFamilies", () => {
    test("a chain of shared pieces lands in one family, transitively", () => {
        // A–B share X directly, B–C share Y — A and C share nothing with
        // each other, but both belong beside B.
        const lines = [line("a", ["X", "P1"], 10), line("b", ["X", "Y"], 20), line("c", ["Y", "P2"], 5)];
        const families = lineFamilies(lines, [shared("X", ["a", "b"]), shared("Y", ["b", "c"])]);

        expect(families).toHaveLength(1);
        expect(families[0].lines.map((l) => l.id)).toEqual(["b", "a", "c"]); // popularity order
    });

    test("a line sharing nothing with any other complete line is a family of one", () => {
        const lines = [line("a", ["X"], 10), line("solo", ["Z"], 1)];
        const families = lineFamilies(lines, [shared("X", ["a"])]);

        expect(families).toHaveLength(2);
        expect(families.map((f) => f.lines.map((l) => l.id))).toContainEqual(["solo"]);
    });

    test("the hub is the piece reaching the most lines in its own family, not just the first card", () => {
        // Echocasting-Symposium-shaped fixture: one piece sits in all four
        // lines, two others sit in two apiece.
        const lines = [
            line("1", ["Recur1", "Echo", "Turn1"], 100),
            line("2", ["Recur2", "Echo", "Turn1"], 90),
            line("3", ["Recur1", "Echo", "Turn2"], 80),
            line("4", ["Recur2", "Echo", "Turn2"], 70),
        ];
        const families = lineFamilies(lines, [
            shared("Echo", ["1", "2", "3", "4"]),
            shared("Recur1", ["1", "3"]),
            shared("Recur2", ["2", "4"]),
            shared("Turn1", ["1", "2"]),
            shared("Turn2", ["3", "4"]),
        ]);

        expect(families).toHaveLength(1);
        expect(families[0].hub).toBe("Echo");
    });

    test("incomplete lines never form or join a family", () => {
        const lines = [line("a", ["X"], 10), line("miss", ["X"], 999, false)];
        const families = lineFamilies(lines, [shared("X", ["a", "miss"])]);

        expect(families).toHaveLength(1);
        expect(families[0].lines.map((l) => l.id)).toEqual(["a"]);
    });

    test("families sort largest first, ties broken by the most-played line", () => {
        const lines = [
            line("solo-weak", ["Z"], 1),
            line("solo-strong", ["W"], 500),
            line("pair-a", ["X"], 10),
            line("pair-b", ["X"], 20),
        ];
        const families = lineFamilies(lines, [shared("X", ["pair-a", "pair-b"])]);

        expect(families.map((f) => f.key)).toEqual(["pair-a", "solo-strong", "solo-weak"]);
    });

    test("no complete lines at all yields no families", () => {
        expect(lineFamilies([line("miss", ["X"], 1, false)], [])).toEqual([]);
    });
});
