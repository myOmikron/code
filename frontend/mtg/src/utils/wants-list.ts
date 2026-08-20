/**
 * Writing what a deck still needs as a Cardmarket wants list.
 *
 * Cardmarket's bulk import reads one line per card, the count first and the
 * card's name after it. The name is the English one, which is what the catalog
 * stores even for a printing in another language.
 *
 * No edition is named on the line. Not as a preference: Cardmarket ignores a set
 * in the imported text and looks the card up across all of them, so writing one
 * would only promise a precision the other side does not keep. Which printing
 * somebody ends up buying is decided in their filters, not here.
 */

/** A card the deck is short of */
export type MissingCard = {
    /** Groups the printings of one card, so two slots of it become one line */
    key: string;
    /** The English name Cardmarket looks up */
    name: string;
    /** How many copies are missing */
    missing: number;
};

/**
 * Folds what several slots are missing into one line per card
 *
 * A card can sit in the main deck and in the sideboard, and the same card can be
 * listed twice in different editions. Cardmarket wants one line per card, so
 * everything that is the same card is added up.
 *
 * @param missing every slot that is short of copies
 *
 * @returns one entry per card, in the order the cards were first met
 */
export function foldMissing(missing: Array<MissingCard>): Array<MissingCard> {
    const folded = new Map<string, MissingCard>();
    for (const card of missing) {
        if (card.missing < 1) continue;
        const known = folded.get(card.key);
        if (known === undefined) {
            folded.set(card.key, { ...card });
            continue;
        }
        known.missing += card.missing;
    }
    return [...folded.values()];
}

/**
 * Writes the list Cardmarket's importer reads
 *
 * @param missing what the deck is short of, one entry per slot
 *
 * @returns the text to paste, empty when nothing is missing
 */
export function wantsList(missing: Array<MissingCard>): string {
    return foldMissing(missing)
        .map((card) => `${card.missing} ${card.name}`)
        .join("\n");
}
