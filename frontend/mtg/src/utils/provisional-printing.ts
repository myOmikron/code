/**
 * Drawing a card before Scryfall has been asked about it.
 *
 * Opening the detail dialog used to wait on `resolvePrintings`, which answers
 * from memory, then from IndexedDB, then from Scryfall itself. The last of
 * those is a network round trip, and until it landed the dialog was not merely
 * empty — it was closed, because it opens on `printing !== null`. Clicking a
 * card therefore did nothing at all for as long as the slowest of the three
 * paths took.
 *
 * The listing already carries most of what the dialog draws: the name, the set,
 * the number, the rarity, the type line, both scans and the prices. Only the
 * rules text, the mana cost, the faces and the link to Scryfall are missing.
 * So the dialog opens on this, complete but for the rules text, and the real
 * printing replaces it a moment later.
 */

import type { ListedCardResponse } from "src/api/generated";
import type { Printing } from "src/utils/scryfall";

/** The parts of a listing's card this can be built from */
export type ListedCard = Pick<
    ListedCardResponse,
    | "name"
    | "set_code"
    | "set_name"
    | "collector_number"
    | "rarity"
    | "type_line"
    | "color_identity"
    | "mana_value"
    | "reserved"
    | "finishes"
    | "image_small"
    | "image_normal"
    | "image_back_small"
    | "image_back_normal"
    | "price_eur_cents"
    | "price_eur_foil_cents"
>;

/**
 * Builds the card the dialog can open on right now.
 *
 * Everything the listing does not know is left empty rather than guessed at.
 * The dialog already hides an empty mana cost, an empty rules text and an empty
 * Scryfall link, so what is missing is absent instead of wrong — and it is only
 * absent until the resolved printing arrives.
 *
 * @param id Scryfall's id of the printing, which the collection entry carries
 * @param card what the listing knows about it
 *
 * @returns a printing good enough to draw
 */
export function provisionalPrinting(id: string, card: ListedCard): Printing {
    return {
        id,
        name: card.name,
        setName: card.set_name,
        setCode: card.set_code,
        collectorNumber: card.collector_number,
        imageUrl: card.image_small ?? null,
        largeImageUrl: card.image_normal ?? null,
        backImageUrl: card.image_back_small ?? null,
        backLargeImageUrl: card.image_back_normal ?? null,
        typeLine: card.type_line,
        rarity: card.rarity,
        colorIdentity: card.color_identity === "" ? [] : card.color_identity.split(""),
        manaValue: card.mana_value,
        reserved: card.reserved,
        finishes: card.finishes,
        priceEur: card.price_eur_cents == null ? null : card.price_eur_cents / 100,
        priceEurFoil: card.price_eur_foil_cents == null ? null : card.price_eur_foil_cents / 100,

        // Not in the listing. Every one of these is guarded by the dialog, so
        // the card simply shows less until the real printing lands.
        manaCost: "",
        oracleText: "",
        scryfallUrl: "",
        releasedAt: "",
        artist: "",
        legalities: {},
        keywords: [],
        faces: [],
    };
}
