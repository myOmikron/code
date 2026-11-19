/**
 * Working out what a deck still needs.
 *
 * The server hands over three flat lists — what the deck asks for, what is
 * sleeved up in it, and every stack elsewhere that holds one of those cards —
 * and deliberately matches none of them against each other: how strictly a
 * copy counts is the player's call, not the database's. Somebody sleeving a
 * budget deck takes any printing of a card they own; somebody building a set
 * deck wants that edition and no other. Both switches live here, together with
 * the counting they change.
 *
 * Everything in this module is pure, which is what lets the numbers on the
 * screen be tested without a database or a browser.
 */

import type { DeckZone, DeviationCopiesResponse, LineDeviationResponse } from "src/api/generated";
import { copiesOf } from "src/utils/deck-deviation";

/** What the two switches over the list are set to */
export type SourcingMatch = {
    /** Whether only the very printing the deck lists counts as a copy */
    exactPrinting: boolean;
    /** Whether a foil slot only counts foils, and a plain slot only plain ones; etched copies count for neither */
    matchFinish: boolean;
};

/** The widest reading of a slot: any printing of the card, either finish */
export const ANY_MATCH: SourcingMatch = { exactPrinting: false, matchFinish: false };

/** The strictest reading of a slot, the one the Deviation reads with: its printing in its finish */
export const EXACT_MATCH: SourcingMatch = { exactPrinting: true, matchFinish: true };

/** The least a slot has to say for the counting to work */
export type SourcingSlotLike = {
    /** Scryfall's id of the printing the list asks for */
    printing: string;
    /** How many copies it asks for */
    quantity: number;
    /** Whether the list asks for foils */
    foil: boolean;
    /** What the catalog knows, absent for a printing it has not caught up with */
    card?: { oracle_id?: string | null } | null;
};

/** The least a stack has to say, whether it lies in the deck or in a collection */
export type SourcingStackLike = {
    /** Scryfall's id of the printing */
    printing: string;
    /** How many copies the stack holds */
    quantity: number;
    /** Finish of the cards */
    finish: string;
    /** What the catalog knows about the printing */
    card?: { oracle_id?: string | null } | null;
};

/** What one card of the deck list comes to */
export type SourcingCount = {
    /** How many copies the deck asks for */
    needed: number;
    /** How many of them are lying in the deck, under the current match */
    filed: number;
    /** How many could still be taken from a collection, under the current match */
    available: number;
    /** How many are neither, and would have to be bought */
    missing: number;
};

/**
 * Whether a stack can fill a slot
 *
 * @param slot the slot to fill
 * @param stack the stack that might fill it
 * @param match how strictly to look
 *
 * @returns whether the copies in the stack count towards the slot
 */
export function fills(slot: SourcingSlotLike, stack: SourcingStackLike, match: SourcingMatch): boolean {
    if (!samePrinting(slot, stack, match.exactPrinting)) return false;
    if (!match.matchFinish) return true;
    return stack.finish === (slot.foil ? "Foil" : "Nonfoil");
}

/**
 * Counts one slot against what is filed and what is lying around.
 *
 * @param slot the slot being counted
 * @param filed every stack in the deck's own collection
 * @param candidates every stack elsewhere in the account
 * @param match how strictly to look
 *
 * @returns the numbers shown on the slot's row
 */
export function countSlot(
    slot: SourcingSlotLike,
    filed: Array<SourcingStackLike>,
    candidates: Array<SourcingStackLike>,
    match: SourcingMatch,
): SourcingCount {
    const copies = (stacks: Array<SourcingStackLike>, use: SourcingMatch) =>
        stacks.reduce((sum, stack) => (fills(slot, stack, use) ? sum + stack.quantity : sum), 0);

    const inDeck = Math.min(copies(filed, match), slot.quantity);
    const available = copies(candidates, match);

    return {
        needed: slot.quantity,
        filed: inDeck,
        available,
        missing: Math.max(0, slot.quantity - inDeck - available),
    };
}

/**
 * Whether two rows are the same card at all
 *
 * @param slot the slot to fill
 * @param stack the stack that might fill it
 * @param exact whether only the very printing counts
 *
 * @returns whether they are the same card under that rule
 */
function samePrinting(slot: SourcingSlotLike, stack: SourcingStackLike, exact: boolean): boolean {
    if (exact) return slot.printing === stack.printing;
    const wanted = slot.card?.oracle_id;
    const held = stack.card?.oracle_id;
    // Without a catalog entry there is nothing to be wider about: the printing
    // id is all either side has.
    if (wanted == null || held == null) return slot.printing === stack.printing;
    return wanted === held;
}

/** What the catalog knows about a printing's price, absent for a printing it has not caught up with */
export type PricedCard = {
    /** Groups every printing of the same card */
    oracle_id?: string | null;
    /** What a plain copy costs, in cents */
    price_eur_cents?: number | null;
    /** What a foil copy costs, in cents */
    price_eur_foil_cents?: number | null;
} | null;

/**
 * What one copy of a printing costs
 *
 * A foil or etched copy is priced as a foil, falling back to the plain price, the way a
 * collection's value is.
 *
 * @param card what the catalog knows about the printing
 * @param foil whether the copy is a foil or an etched one
 *
 * @returns the price in cents, `null` without one
 */
export function unitPrice(card: PricedCard | undefined, foil: boolean): number | null {
    const price = foil ? (card?.price_eur_foil_cents ?? card?.price_eur_cents) : card?.price_eur_cents;
    return price ?? null;
}

/**
 * The stacks in the Physical deck whose card no Deck entry names
 *
 * Any printing or finish of a listed card belongs to its Deck entry, as another
 * printing standing in; what is left over is what a swap forgot to sort back.
 * The slots never hold the maybe board, so a card only considered there is off
 * the list too.
 *
 * @param filed every stack lying in the Physical deck
 * @param slots every Deck entry the Physical deck answers
 *
 * @returns the stacks off the list, real cards and Proxies alike, in the order they were filed
 */
export function stacksOffTheList<S extends SourcingStackLike>(
    filed: Array<S>,
    slots: Array<SourcingSlotLike>,
): Array<S> {
    return filed.filter((stack) => !slots.some((slot) => fills(slot, stack, ANY_MATCH)));
}

/** The least a filed stack has to say to be put in reading order */
export type NamedStack = {
    /** What the catalog knows, absent for a printing it has not caught up with */
    card?: {
        /** The printed name, which is what the rows are read down by */
        name?: string | null;
        /** Set code, to keep two prints of one card in a fixed order */
        set_code?: string | null;
        /** Collector number, for two prints from the same set */
        collector_number?: string | null;
    } | null;
};

/** The least a filed stack has to say to be sorted by where it came from */
export type OriginatedStack = {
    /** The collection it came out of, absent for what was never in one */
    origin?: string | null;
    /** What that collection is called */
    origin_name?: string | null;
    /** Its marker colour */
    origin_color?: string | null;
    /** Its marker pictogram */
    origin_icon?: string | null;
};

/** One collection's worth of what came out of it */
export type OriginGroup<T> = {
    /** The collection, `null` for cards that remember none */
    origin: string | null;
    /** What it is called, `null` once it is gone or was never there */
    name: string | null;
    /** Its marker colour */
    color: string | null;
    /** Its marker pictogram */
    icon: string | null;
    /** What came out of it */
    stacks: Array<T>;
};

/**
 * Sorts what is in a deck by the collection it came out of, and by name inside
 * each of them.
 *
 * Both views onto a deck's cards read this way round: somebody standing at a
 * shelf asks which collection to open next, not which card to look up. Cards that
 * remember no collection come last, because they are the ones that need a decision.
 *
 * Alphabetical within a group for the same reason the groups exist: the list is
 * read with the collection open in the other hand, and the order cards were
 * filed in is not an order anybody can look something up in. Two prints of one
 * card stay together, by set and collector number, so a row is never ambiguous.
 *
 * @param filed every stack lying in the deck
 *
 * @returns one group per collection, the homeless cards last
 */
export function groupByOrigin<T extends OriginatedStack & NamedStack>(filed: Array<T>): Array<OriginGroup<T>> {
    const groups = new Map<string, OriginGroup<T>>();
    for (const stack of filed) {
        const key = stack.origin ?? "none";
        const group = groups.get(key);
        if (group === undefined) {
            groups.set(key, {
                origin: stack.origin ?? null,
                name: stack.origin_name ?? null,
                color: stack.origin_color ?? null,
                icon: stack.origin_icon ?? null,
                stacks: [stack],
            });
            continue;
        }
        group.stacks.push(stack);
    }
    for (const group of groups.values()) {
        group.stacks.sort(byCard);
    }

    return [...groups.values()].sort((left, right) => {
        if (left.origin === null) return 1;
        if (right.origin === null) return -1;
        return (left.name ?? "").localeCompare(right.name ?? "");
    });
}

/**
 * Reading order for two stacks of one group
 *
 * A printing the catalog does not know has no name to sort by and goes last,
 * where an unreadable row is least in the way.
 *
 * @param left one stack
 * @param right the other
 *
 * @returns which of them comes first
 */
function byCard(left: NamedStack, right: NamedStack): number {
    const name = (stack: NamedStack) => stack.card?.name ?? "";
    if (name(left) === "" || name(right) === "") return name(right).localeCompare(name(left));

    const byName = name(left).localeCompare(name(right));
    if (byName !== 0) return byName;

    const set = (left.card?.set_code ?? "").localeCompare(right.card?.set_code ?? "");
    if (set !== 0) return set;

    return (left.card?.collector_number ?? "").localeCompare(right.card?.collector_number ?? "", undefined, {
        numeric: true,
    });
}

/** The least a Deck entry has to say for the Physical deck decisions */
export type DeckEntryLike = SourcingSlotLike & {
    /** The part of the deck it is in; the maybe board is outside the Physical deck */
    zone: DeckZone;
};

/** The least a stack lying in the Physical deck has to say */
export type FiledStackLike = SourcingStackLike & {
    /** Whether the stack holds Proxies rather than real cards */
    proxy: boolean;
};

/** Some copies out of one stack */
export type StackShare<S> = {
    /** The stack */
    stack: S;
    /** How many of its copies */
    quantity: number;
};

/** What `X` does to a Deck entry */
export type ProxyToggle<F> =
    /** Put Proxies in for the Deck entry's missing copies, creating the Physical deck if there is none */
    | { kind: "put"; quantity: number }
    /** Throw the Deck entry's Proxies away again, out of the given stacks */
    | { kind: "discard"; quantity: number; stacks: Array<StackShare<F>> };

/**
 * What `X` does to a Deck entry: fill its gap with Proxies, or throw its Proxies away again
 *
 * A Deck entry held only by real copies is left alone, so `X` can never throw a
 * real card away, and the maybe board never gets into the Physical deck.
 *
 * @param entry the Deck entry
 * @param line what the Physical deck holds for it, `undefined` for a deck without a Physical deck
 * @param filed every stack lying in the Physical deck
 *
 * @returns what to do, `null` for nothing
 */
export function proxyToggle<F extends FiledStackLike>(
    entry: DeckEntryLike,
    line: LineDeviationResponse | undefined,
    filed: Array<F>,
): ProxyToggle<F> | null {
    if (entry.zone === "Maybe") return null;
    const missing = missingCopies(entry, line);
    if (missing > 0) return { kind: "put", quantity: missing };
    const stacks = lineCopies(entry, line, filed, true);
    if (stacks.length === 0) return null;
    return { kind: "discard", quantity: sumOf(stacks), stacks };
}

/**
 * The Proxies or the real copies answering a Deck entry, out of the stacks they lie in
 *
 * The Deck entry's own printing first, then copies of another printing standing
 * in for it; a stack shared with another Deck entry gives only this one's share.
 *
 * @param entry the Deck entry
 * @param line what the Physical deck holds for it
 * @param filed every stack lying in the Physical deck
 * @param proxy whether to look for Proxies rather than real copies
 *
 * @returns the copies, empty without any
 */
function lineCopies<F extends FiledStackLike>(
    entry: DeckEntryLike,
    line: LineDeviationResponse | undefined,
    filed: Array<F>,
    proxy: boolean,
): Array<StackShare<F>> {
    if (line === undefined) return [];
    const kind = filed.filter((stack) => stack.proxy === proxy);
    const exact = share(
        kind.filter((stack) => fills(entry, stack, EXACT_MATCH)),
        proxy ? line.proxies : line.in_deck - line.proxies,
    );
    const other = line.other_printing
        .filter((copies) => copies.proxy === proxy)
        .flatMap((copies) =>
            share(
                kind.filter((stack) => sameCopies(stack, copies)),
                copies.quantity,
            ),
        );
    return [...exact, ...other];
}

/**
 * How many copies a Deck entry is missing
 *
 * @param entry the Deck entry
 * @param line what the Physical deck holds for it, `undefined` for a deck without a Physical deck
 *
 * @returns every copy it asks for without a Physical deck, else what the Deviation counts missing
 */
function missingCopies(entry: DeckEntryLike, line: LineDeviationResponse | undefined): number {
    return line === undefined ? entry.quantity : line.missing;
}

/**
 * Takes copies out of stacks in order until there are enough
 *
 * @param stacks where the copies lie
 * @param wanted how many copies
 *
 * @returns the shares, each stack giving at most what it holds
 */
function share<S extends { quantity: number }>(stacks: Array<S>, wanted: number): Array<StackShare<S>> {
    const shares: Array<StackShare<S>> = [];
    let open = wanted;
    for (const stack of stacks) {
        if (open <= 0) break;
        const quantity = Math.min(open, stack.quantity);
        if (quantity <= 0) continue;
        shares.push({ stack, quantity });
        open -= quantity;
    }
    return shares;
}

/**
 * How many copies some shares come to
 *
 * @param shares the shares
 *
 * @returns their sum
 */
function sumOf<S>(shares: Array<StackShare<S>>): number {
    return shares.reduce((sum, part) => sum + part.quantity, 0);
}

/**
 * Whether a stack holds copies the Deviation names
 *
 * @param stack the stack
 * @param copies the copies the Deviation names
 *
 * @returns whether they are the same printing, finish and kind
 */
function sameCopies(stack: FiledStackLike, copies: DeviationCopiesResponse): boolean {
    return stack.printing === copies.printing && stack.finish === copies.finish && stack.proxy === copies.proxy;
}

/** The least a stack on the shelf has to say to be offered for sourcing */
export type CandidateStackLike = SourcingStackLike & {
    /** The deck whose Physical deck the stack lies in, which is never a source */
    collection_deck?: string | null;
};

/**
 * The stacks that may be taken: none lying in another deck's Physical deck
 *
 * @param candidates every stack in the owner's collections
 *
 * @returns the ones on the shelf
 */
function onTheShelf<C extends CandidateStackLike>(candidates: Array<C>): Array<C> {
    return candidates.filter((stack) => stack.collection_deck == null);
}

/** One thing "Besorgen" offers for a Deck entry, carrying what its call needs */
export type SourcingOffer<C, F> =
    /** Take copies out of a stack on the shelf; one of another printing or finish counts as a Deviation */
    | { kind: "take"; candidate: C; quantity: number; exact: boolean }
    /** Record the Deck entry's missing copies as bought straight into the deck */
    | { kind: "bought"; quantity: number }
    /** What `X` does: put Proxies in, or throw them away again */
    | { kind: "proxy"; toggle: ProxyToggle<F> }
    /** Replace Proxies with real copies out of a stack on the shelf */
    | { kind: "replace"; proxy: F; candidate: C; quantity: number; exact: boolean }
    /** Return the Deck entry's real copies in a stack to where they came from */
    | { kind: "return"; stack: F; quantity: number };

/**
 * What "Besorgen" offers for a Deck entry, in the order the menu lists it
 *
 * For a Deck entry missing copies: the stacks of its printing and finish, then those
 * of another printing or finish, then recording them as bought. Then the Proxy
 * toggle `X` has too. For a Deck entry holding Proxies: replacing them out of a stack,
 * exact ones first. Last, returning the Deck entry's real copies. Stacks lying in
 * another deck's Physical deck are never offered, and the maybe board is
 * offered nothing.
 *
 * @param entry the Deck entry
 * @param line what the Physical deck holds for it, `undefined` for a deck without a Physical deck
 * @param filed every stack lying in the Physical deck
 * @param candidates every stack on the shelf of the owner's collections
 *
 * @returns the offers, empty for nothing
 */
export function sourcingOffers<C extends CandidateStackLike, F extends FiledStackLike>(
    entry: DeckEntryLike,
    line: LineDeviationResponse | undefined,
    filed: Array<F>,
    candidates: Array<C>,
): Array<SourcingOffer<C, F>> {
    if (entry.zone === "Maybe") return [];

    const shelf = onTheShelf(candidates).filter((stack) => fills(entry, stack, ANY_MATCH));
    const exactFirst = [
        ...shelf.filter((stack) => fills(entry, stack, EXACT_MATCH)).map((candidate) => ({ candidate, exact: true })),
        ...shelf.filter((stack) => !fills(entry, stack, EXACT_MATCH)).map((candidate) => ({ candidate, exact: false })),
    ];
    const offers: Array<SourcingOffer<C, F>> = [];

    const missing = missingCopies(entry, line);
    if (missing > 0) {
        for (const { candidate, exact } of exactFirst) {
            offers.push({ kind: "take", candidate, quantity: Math.min(missing, candidate.quantity), exact });
        }
        offers.push({ kind: "bought", quantity: missing });
    }

    const toggle = proxyToggle(entry, line, filed);
    if (toggle !== null) offers.push({ kind: "proxy", toggle });

    for (const { stack: proxy, quantity } of lineCopies(entry, line, filed, true)) {
        for (const { candidate, exact } of exactFirst) {
            offers.push({ kind: "replace", proxy, candidate, quantity: Math.min(quantity, candidate.quantity), exact });
        }
    }

    for (const { stack, quantity } of lineCopies(entry, line, filed, false)) {
        offers.push({ kind: "return", stack, quantity });
    }
    return offers;
}

/** A Deck entry the Physical deck is still short of, counted the way its badge reads */
export type ShortEntry<E> = {
    /** The Deck entry */
    entry: E;
    /** Copies in the Physical deck answering it, another printing or finish included */
    held: number;
    /** Copies it asks for */
    wanted: number;
    /** Missing copies lying in a collection, of its printing and finish */
    available: number;
    /** Missing copies neither in the Physical deck nor in a collection */
    toBuy: number;
};

/** What the Physical deck is still short of, see {@link shortEntries} */
export type ShortSummary<E> = {
    /** Copies the Deck entries the Physical deck answers ask for */
    needed: number;
    /** Of those, the copies the Physical deck holds */
    held: number;
    /** The Deck entries still missing copies, in the order of the list */
    short: Array<ShortEntry<E>>;
    /** Copies still to buy altogether */
    toBuy: number;
    /** What buying them costs, in cents */
    cost: number;
};

/**
 * What the Physical deck is still short of, in agreement with the Deviation
 *
 * A Deck entry counts as short exactly when its badge says so: copies of another
 * printing or finish standing in hold it. What is missing is to buy unless a
 * collection holds its printing and finish; a stack in another deck's Physical
 * deck is no source.
 *
 * @param entries the Deck entries
 * @param lines the Deviation by Deck entry; an entry without one (the maybe board) is left out
 * @param candidates every stack in the owner's collections, empty for a reader who sees none
 *
 * @returns the short entries and the totals
 */
export function shortEntries<E extends DeckEntryLike & { uuid: string; card?: PricedCard }>(
    entries: Array<E>,
    lines: Map<string, LineDeviationResponse>,
    candidates: Array<CandidateStackLike>,
): ShortSummary<E> {
    const shelf = onTheShelf(candidates);
    const summary: ShortSummary<E> = { needed: 0, held: 0, short: [], toBuy: 0, cost: 0 };
    for (const entry of entries) {
        const line = lines.get(entry.uuid);
        if (line === undefined) continue;
        summary.needed += entry.quantity;
        summary.held += Math.max(0, entry.quantity - line.missing);
        if (line.missing <= 0) continue;

        const held = line.in_deck + copiesOf(line.other_printing);
        const available = Math.min(line.missing, countSlot(entry, [], shelf, EXACT_MATCH).available);
        const toBuy = line.missing - available;
        summary.short.push({ entry, held, wanted: held + line.missing, available, toBuy });
        summary.toBuy += toBuy;
        summary.cost += (unitPrice(entry.card, entry.foil) ?? 0) * toBuy;
    }
    return summary;
}
