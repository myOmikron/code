/**
 * What a card is worth, and what a stack of them cost.
 *
 * Two rules live here, both of which the backend also states — in
 * `models/collection/listing.rs` for the worth and in `models/collection/mod.rs`
 * for the folding. They are written down a second time because the client is
 * where a card is filed by hand and has to say what that copy cost before the
 * server ever sees it. If one of the two moves, the other has to move with it:
 * a collection whose list and whose statistics disagree about a card is worse
 * than one that values it slightly differently.
 */

import type { CardFinish } from "src/api/generated";
import type { Printing } from "src/utils/scryfall";

/** A stack as the folding sees it: what one copy cost, and how many there are */
export type PricedStack = {
    /** What one copy cost, in euro cents, absent when nobody wrote it down */
    priceCents: number | null | undefined;
    /** How many copies the stack holds */
    quantity: number;
};

/**
 * What one copy of a stack is worth today, in euro cents
 *
 * Anything that is not plain cardboard is worth the foil price — Scryfall
 * quotes no separate euro price for an etched foil, so that is the closest it
 * has. Falling back to the ordinary price keeps a foil the catalog has not
 * priced from reading as worthless.
 *
 * @param finish the finish the copies were printed with
 * @param priceEurCents the ordinary market price
 * @param priceEurFoilCents the foil market price
 *
 * @returns the price in cents, or `null` when the card is unpriced
 */
export function unitPriceCents(
    finish: CardFinish,
    priceEurCents: number | null | undefined,
    priceEurFoilCents: number | null | undefined,
): number | null {
    const cents = finish === "Nonfoil" ? priceEurCents : (priceEurFoilCents ?? priceEurCents);
    return cents ?? null;
}

/**
 * What a copy of a printing costs today, from what Scryfall quotes
 *
 * The price a card filed by hand is recorded at: somebody who just put a card
 * in the collection paid roughly what it goes for, and that is a far better
 * record than no record at all.
 *
 * @param printing the printing as Scryfall describes it
 * @param finish the finish it is being filed in
 *
 * @returns the price in cents, or `null` when Scryfall quotes none
 */
export function marketPriceCents(printing: Printing, finish: CardFinish): number | null {
    const euro = finish === "Nonfoil" ? printing.priceEur : (printing.priceEurFoil ?? printing.priceEur);
    return euro == null ? null : Math.round(euro * 100);
}

/**
 * The price per copy a stack carries once several of them became one
 *
 * A stack records what one copy cost, so the money it stands for is that price
 * times its count. Folding stacks together therefore has to spread what was
 * actually spent over *every* copy that ends up in the stack, not only over the
 * ones that came with a price: keeping the old price and raising the count
 * instead would charge the new copies at the old one's price and report money
 * nobody paid.
 *
 * `null` when no stack recorded a price at all — that is "nobody wrote it
 * down", which is not the same as having paid nothing, and it stays that way.
 *
 * The remaining cents are dropped rather than rounded, because that is what the
 * backend's integer division does when it folds the same two stacks.
 *
 * @param stacks the stacks being folded into one
 *
 * @returns the price per copy in cents, or `null` when none was recorded
 */
export function foldPriceCents(stacks: Array<PricedStack>): number | null {
    const copies = stacks.reduce((sum, stack) => sum + stack.quantity, 0);
    if (copies < 1 || !stacks.some((stack) => stack.priceCents != null)) return null;

    const spent = stacks.reduce((sum, stack) => sum + (stack.priceCents ?? 0) * stack.quantity, 0);
    return Math.floor(spent / copies);
}
