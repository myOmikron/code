import type { DeckCardResponse, DeckZone } from "src/api/generated";
import type { Printing } from "src/utils/scryfall";

/**
 * The Deck entry a search hit counts against in a zone
 *
 * The entry holding the hit's own printing, else one holding the same card in
 * another printing: a card already in the zone keeps the printing it has there.
 * Either way a plain entry, neither foil nor proxy, goes before the others.
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
    const inZone = entries.filter((entry) => entry.zone === zone);
    return (
        plainFirst(inZone.filter((entry) => entry.printing === printing.id)) ??
        plainFirst(inZone.filter((entry) => entry.card?.name === printing.name))
    );
}

/**
 * The first plain entry, else the first one
 *
 * @param entries the candidates
 *
 * @returns the entry, `undefined` for no candidates
 */
function plainFirst(entries: Array<DeckCardResponse>): DeckCardResponse | undefined {
    return entries.find((entry) => !entry.foil && !entry.proxy) ?? entries[0];
}
