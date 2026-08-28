/**
 * Reading a pasted decklist.
 *
 * Everything writes the same shape and nobody agrees on the details: MTG Arena
 * writes `1 Sol Ring (LTR) 123` under a `Deck` heading, MTGO leaves the set out
 * and separates the sideboard with a blank line, Moxfield appends `*F*` for
 * foils, and Archidekt hangs its categories on the end in brackets. All of it
 * is the same three facts per line — how many, which card, which printing — so
 * the parser reads those and throws the decoration away.
 */

import type { DeckZone } from "src/api/generated";

/** One card read off a decklist */
export type DecklistRow = {
    /** How many copies the line asks for */
    quantity: number;
    /** The card's name as written */
    name: string;
    /** The set it was printed in, when the line says */
    setCode?: string;
    /** The collector number, when the line says */
    collectorNumber?: string;
    /** Whether the line asks for the foil copies */
    foil?: boolean;
    /** Which zone the line stood under */
    zone: DeckZone;
};

/** What a pasted decklist turned into */
export type Decklist = {
    /** The cards, in the order they were written */
    rows: Array<DecklistRow>;
    /** Lines that are not blank, not a heading and not a card */
    unreadable: Array<string>;
};

/** A line naming a zone, e.g. `Sideboard` or `// Commander` */
const HEADINGS: Array<[RegExp, DeckZone]> = [
    [/^(deck|main ?deck|maindeck|main)$/i, "Main"],
    [/^(sideboard|side ?board|side)$/i, "Side"],
    [/^(commander|commanders|command ?zone)$/i, "Commander"],
    [/^companion$/i, "Companion"],
    [/^(maybe ?board|maybe|considering)$/i, "Maybe"],
];

/** The marker Moxfield and Archidekt append for a foil or etched copy */
const FOIL = /\*[fe]\*/i;

/**
 * A card line.
 *
 * The count may carry an `x`, the set and number are optional and the rest of
 * the line is decoration nobody needs: `*F*`, `[Ramp{noDeck}]`, `#tags`.
 */
const CARD = /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([^)]{1,8})\)(?:\s+([^\s[*#]+))?)?\s*$/;

/**
 * Read a pasted decklist
 *
 * @param text what was pasted
 * @param fallback the zone for lines written before any heading
 *
 * @returns the cards and whatever could not be read
 */
export function parseDecklist(text: string, fallback: DeckZone = "Main"): Decklist {
    const rows: Array<DecklistRow> = [];
    const unreadable: Array<string> = [];

    let zone = fallback;
    // MTGO and Arena separate the sideboard with a blank line instead of a
    // heading. Only the first such break switches, and only when no heading has
    // said otherwise, so a list that spaces out its sections stays readable.
    let sawHeading = false;
    let sawCard = false;
    let brokeOnce = false;

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();

        if (line === "") {
            if (!sawHeading && sawCard && !brokeOnce) {
                zone = "Side";
                brokeOnce = true;
            }
            continue;
        }

        const heading = headingOf(line);
        if (heading !== null) {
            zone = heading;
            sawHeading = true;
            continue;
        }

        // A comment that is not a heading carries nothing worth keeping.
        if (line.startsWith("//") || line.startsWith("#")) continue;

        const row = cardOf(strip(line), zone, FOIL.test(line));
        if (row === null) unreadable.push(line);
        else {
            rows.push(row);
            sawCard = true;
        }
    }

    return { rows, unreadable };
}

/**
 * The zone a heading names, or `null` when the line is not one
 *
 * @param line the trimmed line
 *
 * @returns the zone
 */
function headingOf(line: string): DeckZone | null {
    const bare = line
        .replace(/^\/\/\s*/, "")
        .replace(/\s*\(\s*\d+\s*\)\s*$/, "")
        .replace(/\s*:\s*$/, "")
        .trim();
    for (const [pattern, zone] of HEADINGS) {
        if (pattern.test(bare)) return zone;
    }
    return null;
}

/**
 * Take the decoration off a card line
 *
 * @param line the trimmed line
 *
 * @returns the line without foil markers, categories and trailing tags
 */
function strip(line: string): string {
    return line
        .replace(/\s*\[[^\]]*\]\s*$/, "")
        .replace(/\s*\*[fe]\*\s*$/i, "")
        .replace(/\s+#.*$/, "")
        .trim();
}

/**
 * Read one card line
 *
 * @param line the stripped line
 * @param zone the zone it stands under
 * @param foil whether the line carried a foil marker
 *
 * @returns the card, or `null` when the line does not read as one
 */
function cardOf(line: string, zone: DeckZone, foil: boolean): DecklistRow | null {
    const match = CARD.exec(line);
    if (match === null) return null;

    const [, count, name, setCode, collectorNumber] = match;
    const trimmed = (name ?? "").trim();
    if (trimmed === "") return null;

    const quantity = count === undefined ? 1 : Number(count);
    if (!Number.isInteger(quantity) || quantity < 1) return null;

    return {
        quantity,
        // A double-faced card is written with both halves; the catalog knows it
        // by the front one.
        name: trimmed.split("//")[0]?.trim() ?? trimmed,
        ...(setCode === undefined ? {} : { setCode: setCode.toUpperCase() }),
        ...(collectorNumber === undefined ? {} : { collectorNumber }),
        ...(foil ? { foil: true } : {}),
        zone,
    };
}
