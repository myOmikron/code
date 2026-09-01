import type { IndexedPrinting } from "src/scanner/embedding-index";
import { listPrintingsNamed } from "src/scanner/scan-client";
import { referenceImageUrl } from "src/scanner/reference-images";
import type { CardRecord } from "src/types";

/**
 * Turns what the scanner recognised into the record the rest of the app stores.
 *
 * Everything but the price comes out of the packed index, which carries the set name, mana cost,
 * type line and colours alongside the identifiers. That matters for the staging list: it can show
 * a proper row the instant a card is confirmed, with no lookup and nothing to wait for.
 *
 * @param printing the row the scanner settled on
 * @returns the card, priced at nothing because the index does not carry prices
 */
export function toCardRecord(printing: IndexedPrinting): CardRecord {
    return {
        id: printing.id,
        name: printing.name,
        setName: printing.setName || printing.set.toUpperCase(),
        setCode: printing.set,
        collectorNumber: printing.collectorNumber,
        manaCost: printing.manaCost,
        typeLine: printing.typeLine,
        colors: printing.colors,
        imageUrl: referenceImageUrl(printing.id, printing.face),
        priceEur: null,
        lang: printing.lang,
    };
}

/**
 * Every printing of a card, for correcting a scan by hand.
 *
 * A printing is a set and a collector number, which is what the frame, the border and the
 * treatment hang off. The language is a separate axis with its own control, so the same printing
 * in eleven languages belongs here as one entry rather than eleven.
 *
 * @param name the card's name
 * @param lang which language to show each printing in, where it has one
 * @returns one entry per printing
 */
export async function listPrintings(name: string, lang?: string): Promise<CardRecord[]> {
    // Answered from the scan index rather than from the set shards this worker used to read. The
    // shards were dropped when the index was rebuilt, so `data/all-card-index` no longer exists at
    // all and every correction failed with "the printings could not be loaded". The scan index
    // carries all 450000 printings and is already in memory whenever a scan produced the card
    // being corrected, which makes it both the only source there is and the cheaper one.
    const printings = await listPrintingsNamed(name);

    // One entry per printing, not per row. A printing is a set and a collector number, which is
    // what the frame, the border and the treatment hang off; the same one exists in up to eleven
    // languages as eleven rows, and listing those turned 63 printings of Lightning Bolt into 137
    // entries that mostly differed in a language the picker has no business changing.
    // The language being corrected wins, so picking another frame keeps the card in the language
    // it is actually printed in. English stands in where that printing was never made in it, and
    // failing both, whatever the catalogue lists first.
    const rank = (printing: (typeof printings)[number]) =>
        printing.lang === lang ? 0 : printing.lang === "en" ? 1 : 2;

    const byPrinting = new Map<string, (typeof printings)[number]>();
    for (const printing of printings) {
        if (printing.face !== 0) continue;
        const key = `${printing.set}/${printing.collectorNumber}`;
        const held = byPrinting.get(key);
        if (!held || rank(printing) < rank(held)) byPrinting.set(key, printing);
    }
    return [...byPrinting.values()].map(toCardRecord);
}
