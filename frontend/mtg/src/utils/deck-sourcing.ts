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

/** What the two switches over the list are set to */
export type SourcingMatch = {
    /** Whether only the very printing the deck lists counts as a copy */
    exactPrinting: boolean;
    /** Whether a foil slot only counts foils, and a plain slot only plain ones */
    matchFinish: boolean;
};

/** The widest reading of a slot: any printing of the card, either finish */
export const ANY_MATCH: SourcingMatch = { exactPrinting: false, matchFinish: false };

/** The least a slot has to say for the counting to work */
export type SourcingSlotLike = {
    /** Scryfall's id of the printing the list asks for */
    printing: string;
    /** How many copies it asks for */
    quantity: number;
    /** Whether the list asks for foils */
    foil: boolean;
    /** Whether the slot is a stand-in — it asks for no cardboard */
    proxy?: boolean;
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
    /** Copies that only a wider printing match would let count */
    otherPrinting: number;
    /** Copies that only a looser finish match would let count */
    otherFinish: number;
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
    return slot.foil === (stack.finish === "Foil");
}

/**
 * Counts one slot against what is filed and what is lying around.
 *
 * The two `other*` numbers are what the hints are drawn from: they say how many
 * copies the current switches are turning away, so the view can offer to loosen
 * them instead of sending somebody shopping for a card they own.
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

    // What the switches are turning away: the same count with one of them
    // relaxed, minus what already counts, so a hint never mentions a copy the
    // row is showing anyway.
    const withAnyPrinting = copies(candidates, { ...match, exactPrinting: false });
    const withAnyFinish = copies(candidates, { ...match, matchFinish: false });

    return {
        needed: slot.quantity,
        filed: inDeck,
        available,
        // A proxy stands in for cardboard nobody has to go find, so it has
        // nothing missing — the "to buy" count and the "Bought it" offer both
        // read off this.
        missing: slot.proxy === true ? 0 : Math.max(0, slot.quantity - inDeck - available),
        otherPrinting: match.exactPrinting ? withAnyPrinting - available : 0,
        otherFinish: match.matchFinish ? withAnyFinish - available : 0,
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
 * A foil is priced as a foil, falling back to the plain price, the way a
 * collection's value is.
 *
 * @param card what the catalog knows about the printing
 * @param foil whether the copy is a foil
 *
 * @returns the price in cents, `null` without one
 */
function unitPrice(card: PricedCard | undefined, foil: boolean): number | null {
    const price = foil ? (card?.price_eur_foil_cents ?? card?.price_eur_cents) : card?.price_eur_cents;
    return price ?? null;
}

/**
 * What buying every copy still missing from the deck would cost
 *
 * Each line at the price of the printing and finish the list asks for; a line
 * the catalog has no price for adds nothing.
 *
 * @param rows every line of the list with its count under the current match
 *
 * @returns the cost in cents
 */
export function missingCost(
    rows: Array<{ slot: SourcingSlotLike & { card?: PricedCard }; count: Pick<SourcingCount, "missing"> }>,
): number {
    return rows.reduce((sum, { slot, count }) => sum + (unitPrice(slot.card, slot.foil) ?? 0) * count.missing, 0);
}

/** The least a stack in the Physical deck has to say to be offered for replacing */
export type ProxyStackLike = SourcingStackLike & {
    /** Whether the stack holds Proxies rather than real cards */
    proxy: boolean;
    /** What the catalog knows about the printing the Proxies stand for */
    card?: PricedCard;
};

/** One Proxy stack and what could take its place */
export type ProxyReplacement<P, C> = {
    /** The Proxies */
    proxy: P;
    /** Copies of the card in the owner's collections, any printing or finish */
    candidates: Array<C>;
    /** What buying the printings the Proxies stand for would cost, in cents; `null` without a price */
    cost: number | null;
};

/**
 * Pairs every Proxy stack in the Physical deck with the owner's copies of its card and the price
 * of buying it
 *
 * @param filed every stack lying in the Physical deck
 * @param candidates every stack elsewhere in the account
 *
 * @returns one entry per Proxy stack, in the order they were filed
 */
export function proxyReplacements<P extends ProxyStackLike, C extends SourcingStackLike>(
    filed: Array<P>,
    candidates: Array<C>,
): Array<ProxyReplacement<P, C>> {
    return filed
        .filter((stack) => stack.proxy)
        .map((proxy) => {
            const foil = proxy.finish === "Foil";
            const slot: SourcingSlotLike = { ...proxy, foil };
            const price = unitPrice(proxy.card, foil);
            return {
                proxy,
                candidates: candidates.filter((candidate) => fills(slot, candidate, ANY_MATCH)),
                cost: price == null ? null : price * proxy.quantity,
            };
        });
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
