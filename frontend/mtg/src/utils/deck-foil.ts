/**
 * Which finish a deck's copies are sleeved in.
 *
 * The flag on the slot says what the owner has; the catalog says what exists.
 * A printing that was never made without a sheen reads as foil whether or not
 * anybody ticked a box, and one that was never made with a sheen cannot be
 * ticked at all.
 */

import type { CardFinish, DeckCardResponse } from "src/api/generated";

/** How Scryfall spells the finishes */
const NONFOIL = "nonfoil";

/** The shiny ones, in the order they are preferred */
const SHINY = ["foil", "etched"];

/**
 * Whether the printing was made in any finish with a sheen
 *
 * @param card the slot
 *
 * @returns whether foil is on offer at all
 */
export function canFoil(card: DeckCardResponse): boolean {
    return card.card?.finishes.some((finish) => SHINY.includes(finish)) === true;
}

/**
 * Whether the printing was only ever made shiny
 *
 * @param card the slot
 *
 * @returns whether there is nothing else to sleeve
 */
export function onlyFoil(card: DeckCardResponse): boolean {
    const finishes = card.card?.finishes ?? [];
    return finishes.length > 0 && !finishes.includes(NONFOIL);
}

/**
 * The finish a slot's copies are drawn in
 *
 * @param card the slot
 *
 * @returns the finish, which is what puts the sheen on the artwork
 */
export function finishOf(card: DeckCardResponse): CardFinish {
    if (!card.foil && !onlyFoil(card)) return "Nonfoil";

    const finishes = card.card?.finishes ?? [];
    if (finishes.includes("foil")) return "Foil";
    if (finishes.includes("etched")) return "Etched";
    return "Nonfoil";
}

/**
 * What one copy of a slot costs, in euro cents
 *
 * The foil price where the copies are foil, because a foil Sol Ring and an
 * ordinary one are not the same purchase.
 *
 * @param card the slot
 *
 * @returns the price, `null` when the catalog has none
 */
export function priceOf(card: DeckCardResponse): number | null {
    if (card.proxy) return null;
    const printing = card.card;
    if (printing == null) return null;
    if (finishOf(card) === "Nonfoil") return printing.price_eur_cents ?? null;
    return printing.price_eur_foil_cents ?? printing.price_eur_cents ?? null;
}
