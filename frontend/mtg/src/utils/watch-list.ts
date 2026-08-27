/**
 * Reading the numbers a watch list row shows.
 *
 * The server counts the shelf, because each entry stores its own two switches
 * and only the database knows what they let through. What is left is the
 * arithmetic between those counts and what the reader is looking for, and that
 * belongs here rather than inside a component: it is what a row actually
 * claims, and it should be testable without a browser.
 */

/** The least a row has to say for the counting to work */
export type WatchedStockLike = {
    /** Copies lying in a collection that is not a deck's */
    free: number;
    /** Copies sleeved up in a deck */
    sleeved: number;
    /** Free copies a wider printing match would count, including `free` */
    free_any_printing: number;
    /** Free copies a looser finish match would count, including `free` */
    free_any_finish: number;
};

/** The least an entry has to say */
export type WatchedEntryLike = {
    /** Whether only the named printing counts */
    exact_printing: boolean;
    /** Whether only the named finish counts */
    match_finish: boolean;
    /** How many copies the account is after */
    wanted: number;
    /**
     * When the price last fell through the alarm, absent while it has not
     *
     * A string, because that is what the wire carries. Nothing here reads the
     * instant, only whether there is one, so parsing it would be work for an
     * answer nobody asks for.
     */
    triggered_at?: string | null;
    /** Whether the reader has seen that alarm */
    acknowledged: boolean;
    /** What the account already holds */
    stock: WatchedStockLike;
};

/** What one row of a watch list comes to */
export type WatchCount = {
    /** Copies free to use right now */
    free: number;
    /** Copies sleeved up in a deck */
    sleeved: number;
    /** Every copy the entry's switches accept, free or sleeved */
    total: number;
    /** How many copies are still missing */
    missing: number;
    /** Free copies that only a wider printing match would let count */
    otherPrinting: number;
    /** Free copies that only a looser finish match would let count */
    otherFinish: number;
    /** How much of the meter the free copies fill, 0 to 100 */
    freeShare: number;
    /**
     * How much of the meter the sleeved copies would fill on top, 0 to 100
     *
     * The ghost half of the bar: copies the account owns but has sleeved up.
     * They do not close the gap on their own, but they are the difference
     * between "buy it" and "take a deck apart", which is a different errand.
     */
    sleevedShare: number;
};

/**
 * Counts one entry against what the account already holds.
 *
 * The two `other*` numbers are what the hints are drawn from: they say how many
 * copies the entry's own switches are turning away, so a row can offer to
 * loosen one instead of sending somebody shopping for a card they own. A switch
 * that is already open turns nothing away, hence the zero.
 *
 * `missing` counts against the free copies only. A card that is sleeved up in a
 * deck is spoken for, and offering it as one less to buy would mean taking that
 * deck apart by accident.
 *
 * @param entry the entry being counted
 *
 * @returns the numbers shown on its row
 */
export function countEntry(entry: WatchedEntryLike): WatchCount {
    const { free, sleeved, free_any_printing, free_any_finish } = entry.stock;
    const wanted = Math.max(1, entry.wanted);
    const covered = Math.min(free, wanted);
    const ghost = Math.min(sleeved, wanted - covered);

    return {
        free,
        sleeved,
        total: free + sleeved,
        missing: Math.max(0, wanted - free),
        otherPrinting: entry.exact_printing ? Math.max(0, free_any_printing - free) : 0,
        otherFinish: entry.match_finish ? Math.max(0, free_any_finish - free) : 0,
        freeShare: (covered / wanted) * 100,
        sleevedShare: (ghost / wanted) * 100,
    };
}

/**
 * What a row is currently about.
 *
 * The one thing a want list is read for at a glance, so it is one word rather
 * than four numbers to compare. The order is the order somebody acts on:
 * an alarm nobody has seen yet is news and outranks everything, a card that is
 * complete needs nothing, a standing alarm is still worth knowing about, and
 * the rest is the hunt.
 */
export type WatchState = "alarm" | "complete" | "cheap" | "hunting";

/**
 * Which of the four states an entry is in
 *
 * @param entry the entry being read
 *
 * @returns its state
 */
export function entryState(entry: WatchedEntryLike): WatchState {
    const triggered = entry.triggered_at != null;
    if (triggered && !entry.acknowledged) return "alarm";
    if (countEntry(entry).missing === 0) return "complete";
    if (triggered) return "cheap";
    return "hunting";
}

/** The lenses a watch list can be read through */
export type WatchLens = "all" | "alarm" | "missing" | "complete";

/** The lenses on offer, in the order they are listed */
export const WATCH_LENSES: Array<WatchLens> = ["all", "alarm", "missing", "complete"];

/**
 * Whether an entry belongs under a lens
 *
 * @param entry the entry being placed
 * @param lens the lens being looked through
 *
 * @returns whether the lens shows it
 */
export function matchesLens(entry: WatchedEntryLike, lens: WatchLens): boolean {
    const state = entryState(entry);
    switch (lens) {
        case "all":
            return true;
        case "alarm":
            return state === "alarm" || state === "cheap";
        case "missing":
            return countEntry(entry).missing > 0;
        case "complete":
            return state === "complete";
    }
}

/** Scryfall's spelling of a finish, per the enum the backend stores */
const FINISH_ON_SCRYFALL: Record<string, string> = {
    Nonfoil: "nonfoil",
    Foil: "foil",
    Etched: "etched",
};

/** The order the finishes are stepped through */
const FINISH_ORDER = ["Nonfoil", "Foil", "Etched"] as const;

/** One of the finishes a printing can exist in */
export type WatchFinish = (typeof FINISH_ORDER)[number];

/** What a change to what a row counts asks the server for */
export type WatchMatchPatch = {
    /** Whether only the named printing counts */
    exact_printing?: boolean;
    /** Whether only the named finish counts */
    match_finish?: boolean;
    /** Which finish is meant */
    finish?: WatchFinish;
    /** Which languages the row accepts, empty for any */
    languages?: Array<string>;
};

/**
 * The finish a row actually insists on, if it insists on one.
 *
 * `finish` is stored on every entry whether or not it is in force — it is what
 * the badge comes back to when the version is pinned again — so reading that
 * column alone claims a foil where the row would take anything. What a row
 * shows has to come through here.
 *
 * @param entry the row being read
 *
 * @returns the finish it insists on, `null` where it takes any
 */
export function pinnedFinish<Finish extends string>(entry: WatchFinishLike<Finish>): Finish | null {
    return entry.exact_printing && entry.match_finish ? entry.finish : null;
}

/**
 * Which finishes a row can be stepped through
 *
 * Only the ones this print was actually made in, plus whatever the entry
 * already names — so a row written before a catalog sync still cycles rather
 * than getting stuck on a value the list no longer offers.
 *
 * @param finish the finish the entry names
 * @param finishes Scryfall's finishes for the printing, comma separated
 *
 * @returns the finishes to step through, in reading order
 */
export function offeredFinishes(finish: string, finishes: string): Array<WatchFinish> {
    const printed = (finishes ?? "").split(",");
    return FINISH_ORDER.filter((option) => option === finish || printed.includes(FINISH_ON_SCRYFALL[option]));
}

/** The least a row has to say for its finish to be read or stepped */
export type WatchFinishLike<Finish extends string = string> = {
    /** Whether only the named printing counts */
    exact_printing: boolean;
    /** Whether only the named finish counts */
    match_finish: boolean;
    /** The finish the entry names */
    finish: Finish;
};

/**
 * The next reading of the finish, as one step of the cycle.
 *
 * "Any finish", then each finish the print exists in, then round again. One
 * function so the badge and the `F` key cannot come to disagree — a key that
 * does something the visible control does not is worse than no key.
 *
 * @param entry the row being stepped
 * @param finishes Scryfall's finishes for the printing, comma separated
 *
 * @returns what to ask the server for, `null` where the finish is not in force
 *          at all because the row accepts any version
 */
export function nextFinish(entry: WatchFinishLike, finishes: string): WatchMatchPatch | null {
    // The finish only narrows anything while the version is pinned, which is
    // also why the badge is not on screen here.
    if (!entry.exact_printing) return null;

    const offered = offeredFinishes(entry.finish, finishes);
    if (!entry.match_finish) return { match_finish: true, finish: offered[0] ?? "Nonfoil" };

    const next = offered[offered.indexOf(entry.finish as WatchFinish) + 1];
    return next === undefined ? { match_finish: false } : { finish: next };
}

/** What a watch list can be ordered by */
export type WatchSort = "added" | "name" | "missing" | "price";

/** The orders on offer, in the order they are listed */
export const WATCH_SORTS: Array<WatchSort> = ["added", "name", "missing", "price"];

/** The least a row has to say to be placed in an order */
export type WatchSortable = WatchedEntryLike & {
    /** Primary key, which is also the order rows were added in */
    uuid: string;
    /** What the catalog knows, absent for a printing it has not caught up with */
    card?: { name?: string | null } | null;
    /** The printing the price refers to, absent when nothing is priced */
    market?: { price_cents: number } | null;
};

/**
 * Orders the rows of a watch list.
 *
 * Client-side, unlike a collection's: a want list is tens of rows, not tens of
 * thousands, and it already arrives in one piece. Sorting it here keeps the
 * order a property of the view rather than another shape of the query.
 *
 * Rows the catalog or the market knows nothing about sink to the bottom of
 * whichever key they are missing, in either direction. A row with no price is
 * not the cheapest row, and flipping the arrow must not make it so.
 *
 * @param entries the rows to place
 * @param sort what to order by
 * @param descending whether to reverse that order
 *
 * @returns a new array, ordered
 */
export function sortEntries<T extends WatchSortable>(
    entries: Array<T>,
    sort: WatchSort,
    descending: boolean,
): Array<T> {
    const direction = descending ? -1 : 1;
    const placed = [...entries];

    placed.sort((left, right) => {
        switch (sort) {
            case "added":
                return left.uuid.localeCompare(right.uuid) * direction;
            case "name":
                return (left.card?.name ?? "").localeCompare(right.card?.name ?? "") * direction;
            case "missing":
                return (countEntry(left).missing - countEntry(right).missing) * direction;
            case "price": {
                const here = left.market?.price_cents;
                const there = right.market?.price_cents;
                if (here == null && there == null) return 0;
                if (here == null) return 1;
                if (there == null) return -1;
                return (here - there) * direction;
            }
        }
    });
    return placed;
}
