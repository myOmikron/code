import { describe, expect, test } from "vitest";
import type { SuggestionGroup } from "src/api/graph-generated";
import { AddMove, PACKAGE_MAX, swipePackages } from "src/utils/advisor-packages";

/**
 * An add move, everything packaging never reads left blank
 *
 * @param id oracle id and name
 * @param typeLine the card's type line
 * @returns the move
 */
function move(id: string, typeLine = "Creature"): AddMove {
    return {
        kind: "add",
        oracle_id: id,
        name: id,
        fact: "",
        badges: [],
        suggestion: { oracle_id: id, name: id, type_line: typeLine },
    } as unknown as AddMove;
}

/**
 * A group holding the given moves' cards
 *
 * @param key the group's key
 * @param moves its cards, best first
 * @returns the group
 */
function group(key: string, moves: Array<AddMove>): SuggestionGroup {
    return { key, label: key, reason: "", suggestions: moves.map((held) => held.suggestion) };
}

const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => move(`${prefix}${index}`));

describe("swipePackages", () => {
    test("themes come before buckets, staples last", () => {
        const staples = ids("s", 5);
        const ramp = ids("r", 5);
        const tokens = ids("t", 5);
        const packages = swipePackages({
            groups: [group("staples", staples), group("bucket:ramp", ramp), group("theme:tokens", tokens)],
            moves: [...staples, ...ramp, ...tokens],
            room: 40,
            colors: 2,
            seen: new Set(),
        });
        expect(packages.map((pack) => pack.key)).toEqual(["theme:tokens", "bucket:ramp", "staples"]);
    });

    test("caps a package and skips groups too small or already seen", () => {
        const big = ids("b", 12);
        const small = ids("m", 3);
        const done = ids("d", 6);
        const packages = swipePackages({
            groups: [group("theme:big", big), group("theme:small", small), group("theme:done", done)],
            moves: [...big, ...small, ...done],
            room: 40,
            colors: 2,
            seen: new Set(["theme:done"]),
        });
        expect(packages).toHaveLength(1);
        expect(packages[0].moves).toHaveLength(PACKAGE_MAX);
    });

    test("leaves out cards no longer open and copies that would overfill the deck", () => {
        const cards = ids("c", 6);
        const plains = move("Plains", "Basic Land — Plains");
        const packages = swipePackages({
            groups: [group("bucket:mana sources", [plains, ...cards])],
            moves: [plains, ...cards.slice(1)],
            room: 9,
            colors: 1,
            seen: new Set(),
        });
        // Plains places five copies, so four more cards fill the nine open slots
        expect(packages[0].moves.map((held) => held.oracle_id)).toEqual(["Plains", "c1", "c2", "c3", "c4"]);
    });
});
