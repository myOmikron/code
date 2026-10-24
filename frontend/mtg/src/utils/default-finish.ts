/**
 * The finish a card is filed in when nothing says which.
 *
 * A card placed by its name alone, or a csv row without a finish, gets its
 * printing's plain finish. A printing never made without a sheen cannot be
 * filed plain, so it gets the shiny finish it was made in.
 */

import type { CardFinish } from "src/api/generated";

/**
 * The finish a printing is filed in when nothing says which
 *
 * @param finishes the printing's finishes, as Scryfall spells them
 *
 * @returns non-foil, unless the printing was only made foil or etched
 */
export function defaultFinish(finishes: ReadonlyArray<string>): CardFinish {
    if (finishes.length === 0 || finishes.includes("nonfoil")) return "Nonfoil";
    if (finishes.includes("foil")) return "Foil";
    if (finishes.includes("etched")) return "Etched";
    return "Nonfoil";
}

/**
 * Whether a Deck entry of a printing is foil when nothing says which
 *
 * @param finishes the printing's finishes, as Scryfall spells them
 *
 * @returns whether the printing was only made foil or etched
 */
export function defaultFoil(finishes: ReadonlyArray<string>): boolean {
    return defaultFinish(finishes) !== "Nonfoil";
}
