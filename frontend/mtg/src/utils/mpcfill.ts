/**
 * A card list as MPCFill reads it.
 *
 * The second way to get a proxy: instead of nine cards on a sheet of A4, the
 * list goes to https://mpcfill.com, which looks every name up in the community
 * drives of custom artwork and hands the finished order to MakePlayingCards.
 * There is no api to post to — the site takes a pasted list under
 * "Add Cards → Text" — so what this builds is that text.
 *
 * Its syntax is small: one card per line, `4x` or `4` in front for the copies,
 * `(SET) 123` behind the name to pin the print, and `//` between the two faces
 * of a card that has them. Scryfall already writes a two-faced card's name as
 * `Front // Back`, which is the same separator, so a name is split on it and
 * the print is written behind each half — MPCFill searches per face, and a
 * half carrying no set would come back unfiltered.
 *
 * MakePlayingCards prices an order by bracket rather than by card, which is
 * what {@link mpcBracket} is for: the list is worth padding out to the bracket
 * it is about to cross, and worth splitting once it grows past the largest one.
 */

import type { ProxyCard } from "src/utils/proxy-print";

/** Where the list is pasted in */
export const MPC_FILL_URL = "https://mpcfill.com";

/** What separates the two faces of a card, in both Scryfall's name and MPCFill's syntax */
const FACES = " // ";

/**
 * The order sizes MakePlayingCards prints, in cards
 *
 * Ascending, and the last of them is the most that goes into one order.
 */
export const MPC_BRACKETS: ReadonlyArray<number> = [
    18, 36, 55, 72, 90, 108, 126, 144, 162, 180, 198, 216, 234, 396, 504, 612,
];

/**
 * The cards of an order, one row per card, the copies added up
 *
 * Two slots of the same print are one row: a deck can hold the same card in the
 * commander zone and the main deck, and an order does not care which slot a
 * copy was asked for. Rows are sorted by name so a list read twice reads the
 * same, and a card the catalog has no name for is dropped — there is nothing to
 * look up for it.
 *
 * @param cards what was picked
 * @param skipBasics whether the basic lands are left off the order
 *
 * @returns the cards, name by name
 */
export function mpcCards(cards: Array<ProxyCard>, skipBasics: boolean): Array<ProxyCard> {
    const rows = new Map<string, ProxyCard>();

    for (const card of cards) {
        if (card.name === "") continue;
        if (skipBasics && card.basic) continue;

        const key = `${card.name}|${card.set}|${card.number}`;
        const known = rows.get(key);
        if (known === undefined) {
            rows.set(key, { ...card, key });
        } else {
            known.copies += card.copies;
        }
    }

    return [...rows.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The punctuation MPCFill's index drops from a name
 *
 * Their own list, character for character. Dropped rather than replaced with a
 * space: their index holds `Urza's Saga` as `urzas saga`, and a search for
 * `urza s saga` finds nothing at all. The hyphen is not in it, so
 * `Snow-Covered Forest` keeps its one.
 */
const DROPPED = /[~`!@#$%^&*(){}[\];:"'\u2019<,.>?/\\|_+=]/g;

/**
 * A card's name as MPCFill's index spells it
 *
 * The service folds a name the same way before searching; this is here for the
 * order file, which carries the query beside every image so that a re-import
 * searches what we searched.
 *
 * @param name the name as printed
 *
 * @returns the name as MPCFill holds it
 */
export function mpcQuery(name: string): string {
    return name
        .toLowerCase()
        .replace(DROPPED, "")
        .split(/\s+/)
        .filter((word) => word !== "")
        .join(" ");
}

/**
 * The names of a card's faces, as MPCFill is asked for them
 *
 * A card is one piece of cardboard with two sides, and MPCFill searches per
 * side. Scryfall writes a two-faced card's name as `Front // Back`, so the
 * halves are read off the name; a card with a single photograph keeps its whole
 * name — a split card is printed as one image, however its name is spelled.
 *
 * @param card the card
 *
 * @returns the front's name and the back's, `null` for a card with one side
 */
export function mpcFaces(card: ProxyCard): { front: string; back: string | null } {
    const halves = card.name.split(FACES);
    if (card.back === null || halves.length < 2) return { front: card.name, back: null };
    return { front: halves[0] ?? card.name, back: halves[1] ?? null };
}

/**
 * How many cards the order holds
 *
 * A two-faced card is one card here, not two: it is printed on both sides of
 * the same piece of cardboard, which is exactly the difference between an order
 * and a sheet of paper.
 *
 * @param cards the order's rows, as {@link mpcCards} returns them
 *
 * @returns the number of cards
 */
export function mpcCount(cards: Array<ProxyCard>): number {
    return cards.reduce((total, card) => total + card.copies, 0);
}

/**
 * The bracket an order of this size is charged as
 *
 * @param count how many cards the order holds
 *
 * @returns the smallest bracket that holds them, `null` for more than fit in one order
 */
export function mpcBracket(count: number): number | null {
    return MPC_BRACKETS.find((bracket) => count <= bracket) ?? null;
}

/**
 * The order as MPCFill's text import reads it
 *
 * @param cards the order's rows, as {@link mpcCards} returns them
 *
 * @returns one line per card, without a trailing newline
 */
export function mpcFillList(cards: Array<ProxyCard>): string {
    return cards.map((card) => mpcFillLine(card)).join("\n");
}

/**
 * One card as one line
 *
 * The print is only written where the catalog knows it: empty brackets behind a
 * name would be read as part of the search rather than as a filter.
 *
 * @param card the card
 *
 * @returns the line
 */
function mpcFillLine(card: ProxyCard): string {
    const print = card.set !== "" && card.number !== "" ? ` (${card.set}) ${card.number}` : "";
    const faces = card.name.split(FACES).map((face) => `${face}${print}`);

    return `${card.copies}x ${faces.join(FACES)}`;
}
