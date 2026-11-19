import type { SuggestionGroup } from "src/api/graph-generated";
import type { Move } from "src/utils/advisor-moves";
import { suggestionAddQuantity } from "src/utils/deck-advisor";

/** An add move, the only kind swiping shows */
export type AddMove = Extract<Move, { kind: "add" }>;

/** Cards of one suggestion group, swiped in one go */
export type SwipePackage = {
    /** The group's key, e.g. `theme:landfall` */
    key: string;
    /** The group's label as the service wrote it */
    label: string;
    /** The cards, best first */
    moves: Array<AddMove>;
};

/** Fewer cards than this are swiped one by one */
export const PACKAGE_MIN = 4;

/** More cards than this stop being glanceable */
export const PACKAGE_MAX = 8;

/**
 * Where a group's package comes in the order: the deck's themes first
 *
 * @param key the group's key
 * @returns lower comes first
 */
function rank(key: string): number {
    if (key.startsWith("theme:") || key.startsWith("typal:")) return 0;
    if (key === "combo") return 1;
    if (key.startsWith("bucket:")) return 2;
    if (key === "staples") return 4;
    return 3;
}

/** What the packages are cut from */
export type PackageInput = {
    /** The report's groups, in the service's order */
    groups: ReadonlyArray<SuggestionGroup>;
    /** The add moves still open to swipe, with a printing to show */
    moves: ReadonlyArray<AddMove>;
    /** Open slots in the deck */
    room: number;
    /** The deck's color count, for how many basics an add places */
    colors: number;
    /** Group keys already swiped */
    seen: ReadonlySet<string>;
};

/**
 * The packages worth swiping: per group its best cards that still fit, themes first
 *
 * @param input the groups and what is still open
 * @param input.groups the report's groups, in the service's order
 * @param input.moves the add moves still open to swipe
 * @param input.room open slots in the deck
 * @param input.colors the deck's color count
 * @param input.seen group keys already swiped
 * @returns the packages, the one to show first at the front
 */
export function swipePackages({ groups, moves, room, colors, seen }: PackageInput): Array<SwipePackage> {
    const open = new Map(moves.map((move) => [move.oracle_id, move]));
    const packages: Array<SwipePackage> = [];
    const ordered = [...groups].sort((left, right) => rank(left.key) - rank(right.key));
    for (const group of ordered) {
        if (seen.has(group.key)) continue;
        const picked: Array<AddMove> = [];
        let copies = 0;
        for (const suggestion of group.suggestions) {
            const move = open.get(suggestion.oracle_id);
            if (move === undefined) continue;
            const quantity = suggestionAddQuantity(move.suggestion.type_line, colors);
            if (copies + quantity > room) continue;
            picked.push(move);
            copies += quantity;
            if (picked.length === PACKAGE_MAX) break;
        }
        if (picked.length >= PACKAGE_MIN) packages.push({ key: group.key, label: group.label, moves: picked });
    }
    return packages;
}
