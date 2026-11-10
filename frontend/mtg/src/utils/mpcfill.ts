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

import type { MpcFillFavoriteImage, MpcFillFavoriteResponse, MpcFillImageResponse } from "src/api/generated";
import type { ProxyGroup } from "src/utils/proxy-list";
import type { ProxyCard } from "src/utils/proxy-print";

/** Where the list is pasted in */
export const MPC_FILL_URL = "https://mpcfill.com";

/** How the tiles of an order can be sorted */
export const MPC_SORTS = ["added", "name"] as const;

/** One way of sorting the tiles of an order */
export type MpcSort = (typeof MPC_SORTS)[number];

/** Where the chosen sort is remembered on this device */
const SORT_KEY = "cardlens.mpcfill-sort.v1";

/** The most names the service looks up in one request */
export const MPC_MAX_NAMES = 300;

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
 * The tiles of one group, as the reader wants to see them
 *
 * Only what is on screen: the order file keeps its own sequence. Cards picked by
 * hand come newest first; a deck arrives all at once and keeps its own order.
 *
 * @param group the group
 * @param sort how to sort its cards
 * @param query the text a tile's name has to contain
 *
 * @returns the cards to show
 */
export function mpcTiles(group: ProxyGroup, sort: MpcSort, query: string): Array<ProxyCard> {
    const wanted = mpcQuery(query);
    const named = group.cards.filter((card) => card.name !== "" && mpcQuery(card.name).includes(wanted));

    if (sort === "name") return named.sort((left, right) => left.name.localeCompare(right.name));
    return group.deck === null ? named.reverse() : named;
}

/** The art picks of an order, image ids by {@link pickKey} */
export type MpcPicks = Record<string, string>;

/** Whether a new art pick is taken for every deck holding the card */
export const MPC_ART_SCOPES = ["ask", "all", "deck"] as const;

/** One answer to that */
export type MpcArtScope = (typeof MPC_ART_SCOPES)[number];

/** Where the answer is remembered on this device */
const ART_SCOPE_KEY = "cardlens.mpcfill-art-scope.v1";

/** What a pick taken for every deck is filed under in place of a deck's uuid */
const EVERY_DECK = "*";

/**
 * What an art pick is filed under
 *
 * @param deck the deck's uuid, `""` for the hand picks, {@link EVERY_DECK} for all of them
 * @param face the name MPCFill is asked for
 *
 * @returns the key
 */
function pickKey(deck: string, face: string): string {
    return `${deck}|${face}`;
}

/**
 * The art taken for one face in one group
 *
 * A deck's own pick comes first, then one taken for every deck, then the
 * favorite, then the top hit.
 *
 * @param picks the order's picks
 * @param images what was found for the face
 * @param group the group the card is in
 * @param face the name MPCFill is asked for
 * @param favorite the account's favorite for the face, if it was found
 *
 * @returns the image, `null` while there is none
 */
export function mpcPick(
    picks: MpcPicks,
    images: Array<MpcFillImageResponse>,
    group: ProxyGroup,
    face: string,
    favorite: MpcFillImageResponse | null = null,
): MpcFillImageResponse | null {
    const chosen = picks[pickKey(group.deck?.uuid ?? "", face)] ?? picks[pickKey(EVERY_DECK, face)];
    return images.find((image) => image.id === chosen) ?? favorite ?? images[0] ?? null;
}

/** How a favorite turned up among what was found for its face */
export type MpcFavoriteStatus = "favorite" | "updated" | "suggested" | "missing";

/** What the account's favorites say about one face */
export type MpcFavoriteMatch = {
    /** How it was found */
    status: MpcFavoriteStatus;
    /** The favorite it was found from */
    favorite: MpcFillFavoriteResponse;
    /** The image to take: the favorite, or the file that replaced it */
    image: MpcFillImageResponse | null;
    /** The same file in another drive, offered rather than taken */
    suggestion: MpcFillImageResponse | null;
};

/**
 * Finds the account's favorite for one face among what was found for it
 *
 * Newest favorite first: the same file, then the same file name in the same
 * drive (a re-upload), then the same file name in another drive.
 *
 * @param images what was found for the face
 * @param favorites the account's favorites, newest first
 * @param face the name MPCFill is asked for, `null` for the cardback
 *
 * @returns the match, `null` when nothing for the face is starred
 */
export function mpcFavorite(
    images: Array<MpcFillImageResponse>,
    favorites: Array<MpcFillFavoriteResponse>,
    face: string | null,
): MpcFavoriteMatch | null {
    const mine = favorites.filter((favorite) => (favorite.face ?? null) === face);
    const first = mine[0];
    if (first === undefined) return null;

    for (const favorite of mine) {
        const image = images.find((found) => found.id === favorite.image.drive_id);
        if (image !== undefined) return { status: "favorite", favorite, image, suggestion: null };
    }
    for (const favorite of mine) {
        const image = images.find(
            (found) => found.source === favorite.image.source && found.name === favorite.image.file_name,
        );
        if (image !== undefined) return { status: "updated", favorite, image, suggestion: null };
    }
    for (const favorite of mine) {
        const suggestion = images.find((found) => found.name === favorite.image.file_name);
        if (suggestion !== undefined) return { status: "suggested", favorite, image: null, suggestion };
    }
    return { status: "missing", favorite: first, image: null, suggestion: null };
}

/**
 * Whether an image is starred for a face
 *
 * @param favorites the account's favorites
 * @param face the name MPCFill is asked for, `null` for the cardback
 * @param id the image's drive id
 *
 * @returns whether it is
 */
export function mpcStarred(favorites: Array<MpcFillFavoriteResponse>, face: string | null, id: string): boolean {
    return favorites.some((favorite) => (favorite.face ?? null) === face && favorite.image.drive_id === id);
}

/**
 * What was found for a face, the starred drives first in their order
 *
 * @param images what was found
 * @param drives the starred drives, first one first
 *
 * @returns the images, otherwise in MPCFill's order
 */
export function mpcByDrives(images: Array<MpcFillImageResponse>, drives: Array<string>): Array<MpcFillImageResponse> {
    if (drives.length === 0) return images;
    const rank = (image: MpcFillImageResponse) => {
        const at = drives.indexOf(image.source);
        return at === -1 ? drives.length : at;
    };
    return [...images].sort((left, right) => rank(left) - rank(right));
}

/**
 * An image as a favorite keeps it
 *
 * @param image the image
 *
 * @returns what is stored
 */
export function mpcFavoriteImage(image: MpcFillImageResponse): MpcFillFavoriteImage {
    return { drive_id: image.id, file_name: image.name, source: image.source, dpi: image.dpi, size: image.size };
}

/**
 * Takes an image for one face
 *
 * @param picks the order's picks
 * @param group the group the card was picked in
 * @param face the name MPCFill is asked for
 * @param id the image
 * @param everywhere whether every deck takes it, decks picked apart before included
 *
 * @returns the new picks
 */
export function mpcChoose(picks: MpcPicks, group: ProxyGroup, face: string, id: string, everywhere: boolean): MpcPicks {
    if (!everywhere) return { ...picks, [pickKey(group.deck?.uuid ?? "", face)]: id };

    const kept = Object.entries(picks).filter(([key]) => key.slice(key.indexOf("|") + 1) !== face);
    return { ...Object.fromEntries(kept), [pickKey(EVERY_DECK, face)]: id };
}

/**
 * How many groups of the order hold a face
 *
 * @param groups the order
 * @param face the name MPCFill is asked for
 *
 * @returns the groups
 */
export function mpcGroupsWith(groups: Array<ProxyGroup>, face: string): number {
    return groups.filter((group) =>
        group.cards.some((card) => {
            const { front, back } = mpcFaces(card);
            return front === face || back === face;
        }),
    ).length;
}

/**
 * Whether a card has no art for one of its sides
 *
 * @param art what was found, by face
 * @param card the card
 *
 * @returns whether it does
 */
export function mpcNeedsArt(art: Record<string, Array<MpcFillImageResponse>>, card: ProxyCard): boolean {
    const { front, back } = mpcFaces(card);
    return (art[front] ?? []).length === 0 || (back !== null && (art[back] ?? []).length === 0);
}

/**
 * The sort this device last chose
 *
 * @returns the sort, newest cards first when there is none
 */
export function loadMpcSort(): MpcSort {
    return load(SORT_KEY, MPC_SORTS, "added");
}

/**
 * Remembers the chosen sort on this device
 *
 * @param sort the sort
 */
export function saveMpcSort(sort: MpcSort) {
    save(SORT_KEY, sort);
}

/**
 * Whether this device takes a new art pick for every deck
 *
 * @returns the answer, asking each time when there is none
 */
export function loadMpcArtScope(): MpcArtScope {
    return load(ART_SCOPE_KEY, MPC_ART_SCOPES, "ask");
}

/**
 * Remembers that on this device
 *
 * @param scope the answer
 */
export function saveMpcArtScope(scope: MpcArtScope) {
    save(ART_SCOPE_KEY, scope);
}

/**
 * One of a few values, as this device stored it
 *
 * @param key where it is stored
 * @param values what it can be
 * @param fallback what it is when nothing usable is stored
 *
 * @returns the value
 */
function load<T extends string>(key: string, values: ReadonlyArray<T>, fallback: T): T {
    try {
        const stored = localStorage.getItem(key);
        return values.find((value) => value === stored) ?? fallback;
    } catch {
        return fallback;
    }
}

/**
 * Stores a value on this device, or nothing where storage is blocked
 *
 * @param key where it is stored
 * @param value the value
 */
function save(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        return;
    }
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
