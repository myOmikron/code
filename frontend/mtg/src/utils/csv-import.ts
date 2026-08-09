/**
 * Reading a collection out of the csv the other trackers export.
 *
 * There is no shared format — Moxfield, Archidekt, Deckbox and ManaBox each
 * name their columns differently and grade conditions on different ladders. So
 * rather than a parser per site, columns are found by their header and matched
 * against every spelling any of them uses. A file from a tracker nobody
 * anticipated works too, as long as its headers are recognisable.
 *
 * @see https://github.com/StepKie/MtgCsvHelper for the per-tracker column names
 */

import type { CardCondition, CardFinish } from "src/api/generated";

/** One card as an export file describes it */
export type ImportRow = {
    /** The card's name, empty when the file identifies it some other way */
    name: string;
    /** Set code, lower case, empty when the file has none */
    setCode: string;
    /** Collector number within the set, empty when the file has none */
    collectorNumber: string;
    /** Scryfall's printing id, empty when the file has none */
    scryfallId: string;
    /** How many copies */
    quantity: number;
    /** The grade, defaulting to near mint when the file says nothing */
    condition: CardCondition;
    /** The finish, defaulting to non-foil */
    finish: CardFinish;
    /** What was paid per copy in cents, `null` when not recorded */
    purchasePriceCents: number | null;
    /** The day the card was acquired as `YYYY-MM-DD`, `null` when not recorded */
    acquiredAt: string | null;
};

/** What a parsed file amounts to */
export type ImportFile = {
    /** The rows that could be read */
    rows: ImportRow[];
    /** Rows that named no card at all and were dropped */
    skipped: number;
    /** The headers as they appeared, for reporting an unusable file */
    headers: string[];
};

/**
 * Header spellings per field, all lower case.
 *
 * Order matters: the first header present wins, so the more specific spelling
 * has to come first.
 */
const COLUMNS: Record<string, string[]> = {
    quantity: ["count", "quantity", "qty", "anzahl"],
    name: ["name", "card name", "card"],
    setCode: ["edition code", "set code", "set_code", "setcode", "set"],
    setName: ["edition name", "set name"],
    collectorNumber: ["collector number", "collector_number", "card number", "collectornumber", "number"],
    scryfallId: ["scryfall id", "scryfall_id", "scryfallid"],
    condition: ["condition", "zustand"],
    finish: ["finish", "foil", "printing", "is foil"],
    purchasePrice: ["purchase price", "purchase_price", "my price", "price bought", "bought price"],
    acquiredAt: ["date added", "date acquired", "acquired", "added"],
};

/**
 * Condition spellings, normalised to lower case without punctuation.
 *
 * The trackers grade on a five-step ladder (near mint down to damaged) while
 * Cardmarket — and therefore this app — uses seven. Anything ambiguous is
 * mapped *down* rather than up: overstating a card's condition inflates what
 * the collection is worth, understating it only costs a pleasant surprise.
 */
const CONDITIONS: Array<[string[], CardCondition]> = [
    [["mint", "m"], "Mint"],
    [["near mint", "nearmint", "nm", "nm-m", "nm/m"], "NearMint"],
    [["excellent", "ex", "exc", "ex+"], "Excellent"],
    [["good", "gd", "good lightly played"], "Good"],
    [["lightly played", "light played", "lightplayed", "lp", "slightly played", "sp"], "LightPlayed"],
    [["moderately played", "mp", "played", "pl"], "Played"],
    [["heavily played", "hp", "damaged", "dmg", "d", "poor", "po"], "Poor"],
];

/** Finish spellings, same normalisation as the conditions */
const FINISHES: Array<[string[], CardFinish]> = [
    [["etched", "foil etched", "etched foil"], "Etched"],
    [["foil", "true", "yes", "1", "ja"], "Foil"],
    [["", "normal", "nonfoil", "non foil", "regular", "false", "no", "0", "nein"], "Nonfoil"],
];

/** The delimiters worth guessing between — German exports use semicolons */
const DELIMITERS = [",", ";", "\t"];

/**
 * Guesses which character separates the fields.
 *
 * Counted outside quotes only: a card called `Look at Me, I'm the DCI` would
 * otherwise make a semicolon-separated file look comma-separated.
 *
 * @param headerLine the first line of the file
 *
 * @returns the delimiter, defaulting to a comma
 */
export function detectDelimiter(headerLine: string): string {
    let best = ",";
    let bestCount = 0;
    for (const candidate of DELIMITERS) {
        let count = 0;
        let quoted = false;
        for (const character of headerLine) {
            if (character === '"') quoted = !quoted;
            else if (character === candidate && !quoted) count += 1;
        }
        if (count > bestCount) {
            best = candidate;
            bestCount = count;
        }
    }
    return best;
}

/**
 * Splits delimited text into rows of fields.
 *
 * Written out rather than pulled in as a dependency because the format is four
 * rules long: fields may be quoted, a doubled quote inside a quoted field is a
 * literal one, and a newline inside quotes belongs to the field.
 *
 * @param text the file's contents
 * @param delimiter the field separator
 *
 * @returns the rows, blank ones dropped
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;

    // A byte order mark would otherwise become part of the first header, which
    // is exactly the header the whole detection hangs on.
    const body = text.replace(/^\uFEFF/, "");

    for (let index = 0; index < body.length; index += 1) {
        const character = body[index];

        if (quoted) {
            if (character === '"') {
                if (body[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    quoted = false;
                }
            } else {
                field += character;
            }
            continue;
        }

        if (character === '"') {
            quoted = true;
        } else if (character === delimiter) {
            row.push(field);
            field = "";
        } else if (character === "\n" || character === "\r") {
            // Swallow the second half of a CRLF rather than reading it as a row.
            if (character === "\r" && body[index + 1] === "\n") index += 1;
            row.push(field);
            field = "";
            if (row.some((value) => value.trim() !== "")) rows.push(row);
            row = [];
        } else {
            field += character;
        }
    }

    row.push(field);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    return rows;
}

/**
 * Strips a value down to what the lookup tables are keyed by
 *
 * @param value the raw cell
 *
 * @returns the value in lower case, without punctuation or double spaces
 */
function normalise(value: string): string {
    return value.toLowerCase().replace(/[().]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Reads a number that may be written in either German or English notation.
 *
 * `1.234,56` and `1,234.56` are the same amount and both turn up, so the
 * separator that appears last is taken as the decimal point.
 *
 * @param value the raw cell
 *
 * @returns the amount, or `null` when there is no number in it
 */
export function parseAmount(value: string): number | null {
    const digits = value.replace(/[^0-9.,-]/g, "");
    if (digits === "" || digits === "-") return null;

    const lastComma = digits.lastIndexOf(",");
    const lastDot = digits.lastIndexOf(".");
    let plain: string;
    if (lastComma === -1 && lastDot === -1) {
        plain = digits;
    } else if (lastComma > lastDot) {
        plain = digits.replace(/\./g, "").replace(",", ".");
    } else {
        plain = digits.replace(/,/g, "");
    }

    const parsed = Number(plain);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Maps a tracker's condition wording onto a Cardmarket grade
 *
 * @param value the raw cell
 *
 * @returns the grade, near mint when the wording is unknown or absent
 */
export function parseCondition(value: string): CardCondition {
    const key = normalise(value);
    if (key === "") return "NearMint";
    for (const [spellings, condition] of CONDITIONS) {
        if (spellings.includes(key)) return condition;
    }
    return "NearMint";
}

/**
 * Maps a tracker's finish wording onto a finish
 *
 * @param value the raw cell
 *
 * @returns the finish, non-foil when the wording is unknown or absent
 */
export function parseFinish(value: string): CardFinish {
    const key = normalise(value);
    for (const [spellings, finish] of FINISHES) {
        if (spellings.includes(key)) return finish;
    }
    return "Nonfoil";
}

/**
 * Finds which column holds which field.
 *
 * The one genuine trap is `Edition`: Moxfield puts the set *code* there while
 * Deckbox puts the set *name*. They are told apart by whether the file also has
 * an explicit `Edition Code`, which only the latter does.
 *
 * @param headers the header row
 *
 * @returns a field name to column index map
 */
function mapColumns(headers: string[]): Record<string, number> {
    const normalised = headers.map((header) => normalise(header));
    const found: Record<string, number> = {};

    for (const [field, spellings] of Object.entries(COLUMNS)) {
        for (const spelling of spellings) {
            const index = normalised.indexOf(spelling);
            if (index !== -1) {
                found[field] = index;
                break;
            }
        }
    }

    const edition = normalised.indexOf("edition");
    if (edition !== -1 && found.setCode === undefined && found.setName === undefined) {
        found.setCode = edition;
    }
    return found;
}

/**
 * Reads an exported collection file.
 *
 * A row has to name a card somehow — by Scryfall id, by set and collector
 * number, or by name. Anything else is counted as skipped rather than guessed
 * at, because a row nobody can identify would silently become the wrong card.
 *
 * @param text the file's contents
 *
 * @returns the rows, and how many were unusable
 */
export function parseCollectionCsv(text: string): ImportFile {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    const table = parseDelimited(text, detectDelimiter(firstLine));
    const [headers, ...body] = table;
    if (headers === undefined) return { rows: [], skipped: 0, headers: [] };

    const columns = mapColumns(headers);

    /**
     * Reads a cell of the current row
     *
     * @param row the row
     * @param field the field name
     *
     * @returns the trimmed cell, empty when the column is absent
     */
    const cell = (row: string[], field: string) => {
        const index = columns[field];
        return index === undefined ? "" : (row[index] ?? "").trim();
    };

    const rows: ImportRow[] = [];
    let skipped = 0;

    for (const row of body) {
        const name = cell(row, "name");
        const scryfallId = cell(row, "scryfallId");
        const setCode = cell(row, "setCode").toLowerCase();
        const collectorNumber = cell(row, "collectorNumber");

        if (scryfallId === "" && name === "" && (setCode === "" || collectorNumber === "")) {
            skipped += 1;
            continue;
        }

        const quantity = parseAmount(cell(row, "quantity")) ?? 1;
        const price = parseAmount(cell(row, "purchasePrice"));
        const acquired = cell(row, "acquiredAt");

        rows.push({
            name,
            setCode,
            collectorNumber,
            scryfallId,
            // A file claiming zero or a fraction of a copy is a file to ignore
            // on that point, not one to file a nonsensical stack from.
            quantity: Math.max(1, Math.round(quantity)),
            condition: parseCondition(cell(row, "condition")),
            finish: parseFinish(cell(row, "finish")),
            purchasePriceCents: price === null || price <= 0 ? null : Math.round(price * 100),
            // Only the unambiguous spelling is taken — `03/04/2024` is either
            // March or April depending on who wrote it.
            acquiredAt: /^\d{4}-\d{2}-\d{2}/.test(acquired) ? acquired.slice(0, 10) : null,
        });
    }

    return { rows, skipped, headers };
}
