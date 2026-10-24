import type { DeckCardResponse, DeckZone } from "src/api/generated";
import type { Printing } from "src/utils/scryfall";

/**
 * The Deck entry a search hit counts against in a zone
 *
 * The entry holding the hit's own printing, else one holding the same card in
 * another printing: a card already in the zone keeps the printing it has there.
 *
 * @param entries the deck's entries
 * @param zone the zone being filed into
 * @param printing the card as the search found it
 *
 * @returns the entry, or `undefined` when the zone does not hold the card
 */
export function zoneEntryOf(
    entries: Array<DeckCardResponse>,
    zone: DeckZone,
    printing: Printing,
): DeckCardResponse | undefined {
    return (
        entries.find((entry) => entry.zone === zone && entry.printing === printing.id) ??
        entries.find((entry) => entry.zone === zone && entry.card?.name === printing.name)
    );
}
