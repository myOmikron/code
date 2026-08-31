import { DeckCardResponse } from "src/api/generated";

/**
 * A card's two scans, as the deck's own printing carries them.
 */
export type CardArt = {
    /** The full artwork, `null` when the catalog has none */
    image: string | null;
    /** The smaller scan of the same printing, for where it is drawn tiny */
    thumbnail: string | null;
};

/**
 * The deck's own artwork, by card name.
 *
 * Keyed by name because that is what the graph service speaks: every count it
 * reports itemises to card names, and this is the deck those names came from.
 *
 * Deliberately the deck's *own* printings rather than a catalog lookup — the
 * artwork a builder recognises is the one in their list, and the whole deck is
 * already in hand, so a panel that opens onto its own cards should never wait
 * on the network to show them.
 *
 * A name held in several zones or printings keeps the first it is found in;
 * they are the same card, and the count that opens onto it counted it once.
 *
 * @param cards the deck's slots, every zone
 *
 * @returns the artwork for each name the deck holds
 */
export function deckArt(cards: Array<DeckCardResponse>): Map<string, CardArt> {
    const art = new Map<string, CardArt>();

    for (const slot of cards) {
        const card = slot.card;
        if (card == null || art.has(card.name)) continue;
        art.set(card.name, {
            image: card.image_normal ?? card.image_small ?? null,
            thumbnail: card.image_small ?? card.image_normal ?? null,
        });
    }

    return art;
}
