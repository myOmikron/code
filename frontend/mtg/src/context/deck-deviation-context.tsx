import { createContext, useContext } from "react";
import type { LineDeviationResponse } from "src/api/generated";

/**
 * What the Physical deck holds for each Deck entry, by the entry's uuid
 *
 * Empty where nothing is known: a deck without a Physical deck, an account
 * that may not see it, or a page that does not show it. The card list provides
 * it, so every view of the list can annotate its lines without threading it
 * through every view's properties.
 */
export const DeckDeviationContext = createContext<Map<string, LineDeviationResponse>>(new Map());

/**
 * Access what the Physical deck holds for one Deck entry
 *
 * @param entry the Deck entry's uuid
 *
 * @returns the line, `undefined` where nothing is known about it
 */
export function useLineDeviation(entry: string): LineDeviationResponse | undefined {
    return useContext(DeckDeviationContext).get(entry);
}
