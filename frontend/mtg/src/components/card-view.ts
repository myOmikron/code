/**
 * The shapes a collection can be looked at in.
 *
 * A collection gets read for different reasons, and no single row suits all of
 * them. Picking out a card by its art wants pictures; checking what a box is
 * worth wants numbers; sorting through a trade binder wants both at once. The
 * views differ in what they spend the width on, not in what they can do.
 */

import type { EntrySort, ListedEntryResponse } from "src/api/generated";

/** How the cards are laid out */
export type CardView = "grid" | "list" | "large" | "table";

/** The views on offer, in the order they are listed. Named by `viewLabel`. */
export const CARD_VIEWS: Array<CardView> = ["grid", "list", "large", "table"];

/**
 * What every view is handed.
 *
 * The same set for all four, so switching between them changes the layout and
 * nothing about what can be done from it.
 */
export type CardViewProps = {
    /** The stacks on this page, already resolved against pending edits */
    entries: ListedEntryResponse[];
    /** Opens a stack's dialog */
    onInspect: (entry: ListedEntryResponse) => void;
    /** Records a new count, or asks to delete when it would drop below one. Left out for a read-only view */
    onChangeQuantity?: (entry: ListedEntryResponse, quantity: number) => void;
    /** Asks to remove a stack. Left out for a read-only view */
    onDelete?: (entry: ListedEntryResponse) => void;
    /** The stack currently being written, which cannot be deleted twice */
    busy?: string | null;
    /** What the page is ordered by, so a view can mark the column */
    sort: EntrySort;
    /** Whether that order is reversed */
    descending: boolean;
    /**
     * Asks for a different order.
     *
     * Only the table uses it — the other views leave ordering to the control
     * above them, because there is nothing in a grid tile to click on.
     */
    onSort: (sort: EntrySort, descending: boolean) => void;
};

/**
 * What one copy of a stack is worth, in euro
 *
 * A foil stack is worth its foil price; falling back to the ordinary one keeps
 * a foil Scryfall has not priced from reading as worthless.
 *
 * @param entry the stack
 *
 * @returns the price in euro, or `null` when the card is unpriced
 */
export function unitPrice(entry: ListedEntryResponse): number | null {
    const card = entry.card;
    if (card == null) return null;
    const cents =
        entry.finish === "Nonfoil" ? card.price_eur_cents : (card.price_eur_foil_cents ?? card.price_eur_cents);
    return cents == null ? null : cents / 100;
}
