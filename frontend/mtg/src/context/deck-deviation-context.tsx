import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { LineDeviationResponse } from "src/api/generated";
import type { MenuAt } from "src/components/context-menu";

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

/**
 * Opens a Deck entry's card menu where its Deviation badge was clicked
 *
 * `undefined` for a reader who may not source the deck: the badge is then only a mark.
 */
export const DeckDeviationMenuContext = createContext<((entry: string, at: MenuAt) => void) | undefined>(undefined);

/**
 * The properties for {@link DeckDeviationProvider}
 */
export type DeckDeviationProviderProps = {
    /** What the Physical deck holds for each Deck entry, by the entry's uuid */
    lines: Map<string, LineDeviationResponse>;
    /** Opens a Deck entry's card menu, absent where the badges are only marks */
    openMenu?: (entry: string, at: MenuAt) => void;
    /** The views that show the marks */
    children: ReactNode;
};

/**
 * Hands the Deviation, and the way from a badge to the card menu, to every view of the list
 *
 * @returns the views inside both contexts
 */
export function DeckDeviationProvider({ lines, openMenu, children }: DeckDeviationProviderProps) {
    return (
        <DeckDeviationContext value={lines}>
            <DeckDeviationMenuContext value={openMenu}>{children}</DeckDeviationMenuContext>
        </DeckDeviationContext>
    );
}
