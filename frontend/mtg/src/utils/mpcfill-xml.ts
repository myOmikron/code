/**
 * An order as MPCFill writes and reads it.
 *
 * The other half of the MPCFill handover: the text list says which cards are
 * wanted and leaves the art to whoever pastes it, an order file names the
 * image that fills every single slot. Both are accepted by MPCFill; only the file
 * survives handing the order to somebody else, because the ids in it are the
 * choice that was made.
 *
 * The shape is theirs, and the one thing worth knowing about it is `slots`: an
 * order is a numbered row of cards, `0` to `quantity - 1`, and an image names
 * the slots it fills rather than a copy count — `<slots>0,1,2</slots>` is three
 * copies of the same art. A back is filed against the slot it belongs to,
 * which is how a single two-faced card gets its own back while every other slot
 * keeps the order's common one.
 *
 * ```xml
 * <order>
 *     <details>
 *         <quantity>3</quantity>
 *         <bracket>18</bracket>
 *         <stock>(S30) Standard Smooth</stock>
 *         <foil>false</foil>
 *     </details>
 *     <fronts>
 *         <card>
 *             <id>1AwWN6P_wTLqMJkXZwOMsUvQMjsGiWSA_</id>
 *             <slots>0,1,2</slots>
 *             <name>Braids, Cabal Minion.jpg</name>
 *             <query>braids cabal minion</query>
 *         </card>
 *     </fronts>
 *     <cardback>1Aa98sI-YvFUSnNYGGfJEbXvXVJvHtLmS</cardback>
 * </order>
 * ```
 */

import { mpcBracket } from "src/utils/mpcfill";

/** The cardstocks MakePlayingCards prints on, as MPCFill spells them */
export const MPC_STOCKS = [
    "(S27) Smooth",
    "(S30) Standard Smooth",
    "(S33) Superior Smooth",
    "(M31) Linen",
    "(P10) Plastic",
] as const;

/** A cardstock an order is printed on */
export type MpcStock = (typeof MPC_STOCKS)[number];

/** What an order is printed on unless something else is picked */
export const DEFAULT_MPC_STOCK: MpcStock = "(S30) Standard Smooth";

/** The one stock that cannot be printed with a foil finish */
const NO_FOIL: MpcStock = "(P10) Plastic";

/** One chosen image out of MPCFill's index */
export type MpcFillPick = {
    /** The Google Drive file id, which is what the order names */
    id: string;
    /** The file's name in the drive, which the order carries along */
    name: string;
};

/** One card of an order, with the art picked for it */
export type MpcFillOrderCard = {
    /** How many copies are wanted */
    copies: number;
    /** What MPCFill was asked for the front, so a re-import searches the same */
    frontQuery: string;
    /** The art picked for the front, `null` while none is */
    front: MpcFillPick | null;
    /** What MPCFill was asked for the back, `null` for a one-sided card */
    backQuery: string | null;
    /** The art picked for the back, `null` while none is */
    back: MpcFillPick | null;
};

/** Everything an order file says */
export type MpcFillOrder = {
    /** The cards, in the order their slots are numbered */
    cards: Array<MpcFillOrderCard>;
    /** What it is printed on */
    stock: MpcStock;
    /** Whether it is printed with a foil finish */
    foil: boolean;
    /** The back every slot that brings none of its own is printed with */
    cardback: MpcFillPick | null;
};

/** One image and the slots it fills */
type Filled = {
    /** The image */
    pick: MpcFillPick;
    /** What MPCFill was asked to find it */
    query: string;
    /** The slots it is printed into, ascending */
    slots: Array<number>;
};

/**
 * Whether an order can be printed with a foil finish
 *
 * @param stock what it is printed on
 *
 * @returns whether foil is on offer
 */
export function mpcFoilable(stock: MpcStock): boolean {
    return stock !== NO_FOIL;
}

/**
 * The cards of an order that can actually be ordered
 *
 * A card nobody picked art for has nothing to print, so it takes no slot: the
 * order is written for what was chosen, and the page says how many rows are
 * still waiting.
 *
 * @param cards the order's cards
 *
 * @returns the cards with a front picked
 */
export function mpcFillReady(cards: Array<MpcFillOrderCard>): Array<MpcFillOrderCard> {
    return cards.filter((card) => card.front !== null && card.copies > 0);
}

/**
 * The order as MPCFill's xml import reads it
 *
 * Slots are handed out in the order the cards are listed, so a file written
 * twice from the same list is the same file — which is what makes it worth
 * keeping next to the deck it belongs to.
 *
 * @param order the cards, the stock and the common back
 *
 * @returns the xml document, ending in a newline
 */
export function mpcFillXml(order: MpcFillOrder): string {
    const cards = mpcFillReady(order.cards);

    const fronts = new Map<string, Filled>();
    const backs = new Map<string, Filled>();
    let slot = 0;

    for (const card of cards) {
        for (let copy = 0; copy < card.copies; copy++) {
            if (card.front !== null) fill(fronts, card.front, card.frontQuery, slot);
            if (card.back !== null) fill(backs, card.back, card.backQuery ?? card.frontQuery, slot);
            slot++;
        }
    }

    const quantity = slot;
    const bracket = mpcBracket(quantity);

    const lines = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<order>`,
        `    <details>`,
        `        <quantity>${quantity}</quantity>`,
        // A bracket is what MakePlayingCards charges by. An order past the
        // largest one cannot be placed in one go, and saying so in the file it
        // was written from is better than writing a number that is not a
        // bracket.
        ...(bracket === null ? [] : [`        <bracket>${bracket}</bracket>`]),
        `        <stock>${escaped(order.stock)}</stock>`,
        `        <foil>${order.foil && mpcFoilable(order.stock) ? "true" : "false"}</foil>`,
        `    </details>`,
        ...faces("fronts", fronts),
        ...faces("backs", backs),
        ...(order.cardback === null ? [] : [`    <cardback>${escaped(order.cardback.id)}</cardback>`]),
        `</order>`,
    ];

    return `${lines.join("\n")}\n`;
}

/**
 * Files one slot against the image printed into it
 *
 * @param filled what has been filled so far, keyed by image
 * @param pick the image
 * @param query what MPCFill was asked to find it
 * @param slot the slot it is printed into
 */
function fill(filled: Map<string, Filled>, pick: MpcFillPick, query: string, slot: number) {
    const known = filled.get(pick.id);
    if (known === undefined) {
        filled.set(pick.id, { pick, query, slots: [slot] });
    } else {
        known.slots.push(slot);
    }
}

/**
 * One side of the order, as its element
 *
 * @param element `fronts` or `backs`
 * @param filled the images and the slots they fill
 *
 * @returns the lines, empty when nothing is filled on this side
 */
function faces(element: "fronts" | "backs", filled: Map<string, Filled>): Array<string> {
    if (filled.size === 0) return [];

    const cards = [...filled.values()].flatMap((entry) => [
        `        <card>`,
        `            <id>${escaped(entry.pick.id)}</id>`,
        `            <slots>${entry.slots.join(",")}</slots>`,
        `            <name>${escaped(entry.pick.name)}</name>`,
        `            <query>${escaped(entry.query)}</query>`,
        `        </card>`,
    ]);

    return [`    <${element}>`, ...cards, `    </${element}>`];
}

/**
 * Text as it may stand inside an element
 *
 * A card's file name is whatever its uploader typed, so it can carry an
 * ampersand — `Fire & Ice.png` — and an unescaped one is not xml at all.
 *
 * @param text the text
 *
 * @returns the text with the five xml entities spelled out
 */
function escaped(text: string): string {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}
