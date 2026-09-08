/**
 * Laying cards out on a sheet of paper.
 *
 * A proxy is only worth printing if it cuts to the size of the card it stands
 * in for, so everything here is in millimetres: a Magic card is 63 by 88, nine
 * of them fit on a sheet of A4 with room to hold it, and that grid is what both
 * the preview and the printed page are built from.
 *
 * The card a proxy run is made of lives here as well, printed at home or
 * ordered elsewhere: {@link ProxyCard} is what a picked card and a taken deck
 * both come out as, and the ordering list in `mpcfill.ts` reads the same rows.
 */

import type { DeckCardResponse } from "src/api/generated";

/** A sheet of A4, in millimetres */
export const SHEET = { width: 210, height: 297 };

/** A Magic card, in millimetres */
export const CARD = { width: 63, height: 88 };

/** How the cards sit on the sheet */
export const GRID = { columns: 3, rows: 3 };

/** How many cards one sheet holds */
export const PER_SHEET = GRID.columns * GRID.rows;

/** What is left of the sheet beside the grid, in millimetres */
export const MARGIN = {
    x: (SHEET.width - GRID.columns * CARD.width) / 2,
    y: (SHEET.height - GRID.rows * CARD.height) / 2,
};

/** How many copies of one card a proxy list holds at most */
export const MAX_COPIES = 99;

/** A card waiting to be proxied */
export type ProxyCard = {
    /** What tells the row apart: a printing's id, a deck slot's id */
    key: string;
    /**
     * The card's name, as the catalog spells it
     *
     * Both halves joined by ` // ` for a card with two of them, which is what
     * Scryfall writes and what an ordering list is read off.
     */
    name: string;
    /** Set code of the print, upper case, empty for a card the catalog misses */
    set: string;
    /** Collector number as printed, empty for a card the catalog misses */
    number: string;
    /** The front, `null` when nothing was photographed */
    front: string | null;
    /** The back, `null` for a card printed on one side */
    back: string | null;
    /** How many copies to print */
    copies: number;
    /** Whether it is a basic land, which a sheet is rarely printed for */
    basic: boolean;
};

/** One picture on the paper */
export type ProxyFace = {
    /** What tells this picture apart from the rest of the sheet */
    key: string;
    /** The card's name, for the alt text */
    name: string;
    /** The picture to print */
    image: string;
    /** Whether this is the card's back */
    back: boolean;
};

/**
 * Every picture that goes on paper, copy by copy
 *
 * A card photographed twice is two pictures, kept next to each other: a
 * transform card is only a proxy once both halves are on the table, and having
 * them come off the sheet side by side is what saves sorting them together
 * afterwards.
 *
 * @param cards what was picked
 * @param backs whether the second face of a two-sided card is printed too
 * @param skipBasics whether the basic lands are left off the sheet
 *
 * @returns the pictures, in the order they are laid out
 */
export function proxyFaces(cards: Array<ProxyCard>, backs: boolean, skipBasics: boolean): Array<ProxyFace> {
    const faces: Array<ProxyFace> = [];

    for (const card of cards) {
        if (skipBasics && card.basic) continue;

        for (let copy = 0; copy < card.copies; copy++) {
            if (card.front !== null) {
                faces.push({ key: `${card.key}-${copy}-front`, name: card.name, image: card.front, back: false });
            }
            if (backs && card.back !== null) {
                faces.push({ key: `${card.key}-${copy}-back`, name: card.name, image: card.back, back: true });
            }
        }
    }

    return faces;
}

/**
 * The pictures, split into sheets
 *
 * @param faces what goes on paper
 *
 * @returns one array per sheet, the last one as short as it turns out
 */
export function proxySheets(faces: Array<ProxyFace>): Array<Array<ProxyFace>> {
    const sheets: Array<Array<ProxyFace>> = [];
    for (let start = 0; start < faces.length; start += PER_SHEET) {
        sheets.push(faces.slice(start, start + PER_SHEET));
    }
    return sheets;
}

/**
 * The same picture in the size worth printing
 *
 * Scryfall serves a scan at several sizes under one path, and the one the app
 * shows on screen is 488 pixels wide: printed at card size that is under 200
 * dpi and reads as a photocopy. `large` is 672 across, which puts a cut proxy
 * at about 270 dpi, and the size after it is a png several times the weight for
 * a difference nobody sees on paper.
 *
 * Anything that is not one of their scans is handed back untouched.
 *
 * @param url the picture as the catalog holds it
 *
 * @returns the picture to print, `null` when there is none
 */
export function printableImage(url: string | null | undefined): string | null {
    if (url == null || url === "") return null;
    return url.replace(
        /^(https:\/\/cards\.scryfall\.io\/)(small|normal|large)(\/)/,
        (_match, host: string, _size: string, slash: string) => `${host}large${slash}`,
    );
}

/**
 * Whether a card is one of the basic lands
 *
 * Read off the type line rather than the name: that covers the snow ones and
 * Wastes without a list of names to keep up to date, and it does not mistake a
 * card that merely mentions an Island for one.
 *
 * @param typeLine the type line as Scryfall spells it
 *
 * @returns whether the card is a basic land
 */
export function isBasicLand(typeLine: string | null | undefined): boolean {
    if (typeLine == null) return false;
    const lower = typeLine.toLowerCase();
    return lower.includes("basic") && lower.includes("land");
}

/**
 * The cards a deck is proxied from
 *
 * The deck proper only: a sideboard is not what anybody prints a sheet or
 * places an order for, and the maybe board is a list of ideas. A slot the
 * catalog has not caught up with still becomes a row — it is worth showing as
 * one that cannot be printed rather than dropping it silently — so the caller
 * that needs a picture has to say so.
 *
 * @param cards the deck's slots
 * @param proxiesOnly whether only the slots marked as proxies are taken
 *
 * @returns the cards, in the order the deck lists them
 */
export function deckProxyCards(cards: Array<DeckCardResponse>, proxiesOnly: boolean): Array<ProxyCard> {
    return cards
        .filter((slot) => (slot.zone === "Main" || slot.zone === "Commander") && (!proxiesOnly || slot.proxy))
        .map((slot) => ({
            key: slot.uuid,
            name: slot.card?.name ?? "",
            set: slot.card?.set_code ?? "",
            number: slot.card?.collector_number ?? "",
            front: printableImage(slot.card?.image_normal),
            back: printableImage(slot.card?.image_back_normal),
            copies: Math.min(MAX_COPIES, slot.quantity),
            basic: isBasicLand(slot.card?.type_line),
        }));
}
