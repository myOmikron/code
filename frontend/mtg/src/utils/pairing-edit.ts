/**
 * The desk's hand edits to a round's tables: swap two players, or move one onto a free seat.
 */

import type { MatchTableResponse } from "src/api/generated";

/** One table while the desk edits it */
export type EditTable = {
    /** The match it came from */
    key: string;
    /** The number printed on it, `0` for the bye */
    number: number;
    /** Whether it is the bye */
    isBye: boolean;
    /** Whether a result is in, so nobody may move */
    locked: boolean;
    /** Who sits there, in seat order */
    seats: Array<string>;
};

/** A round's layout while the desk edits it */
export type EditLayout = {
    /** The tables, in the order they are shown */
    tables: Array<EditTable>;
    /** Checked-in players without a seat */
    tray: Array<string>;
};

/** Where somebody sits in a layout */
type Spot = { table: number; seat: number } | { tray: number };

/**
 * Builds an editable layout from a round's tables
 *
 * @param tables the round's tables, byes last
 * @param unseated checked-in players the pairing left out
 *
 * @returns the layout
 */
export function layoutFrom(tables: Array<MatchTableResponse>, unseated: Array<string>): EditLayout {
    return {
        tables: tables.map((table) => ({
            key: table.uuid,
            number: table.table_number,
            isBye: table.is_bye,
            locked: !table.is_bye && table.status !== "Unreported",
            seats: table.seats.map((seat) => seat.participant),
        })),
        tray: [...unseated],
    };
}

/**
 * Finds where somebody sits
 *
 * @param layout the layout
 * @param player who to look for
 *
 * @returns their spot, or `null` when they are not in it
 */
function spotOf(layout: EditLayout, player: string): Spot | null {
    for (const [table, entry] of layout.tables.entries()) {
        const seat = entry.seats.indexOf(player);
        if (seat >= 0) return { table, seat };
    }
    const tray = layout.tray.indexOf(player);
    return tray >= 0 ? { tray } : null;
}

/**
 * Whether somebody may be picked up at all
 *
 * @param layout the layout
 * @param player who
 *
 * @returns `false` for a player at a table with a result
 */
export function isMovable(layout: EditLayout, player: string): boolean {
    const spot = spotOf(layout, player);
    if (spot === null) return false;
    return "tray" in spot || !layout.tables[spot.table].locked;
}

/**
 * Trades two players' places; either may be in the tray
 *
 * @param layout the layout
 * @param a one player
 * @param b the other
 *
 * @returns the new layout, or the old one when either cannot move
 */
export function swap(layout: EditLayout, a: string, b: string): EditLayout {
    if (a === b || !isMovable(layout, a) || !isMovable(layout, b)) return layout;
    const next: EditLayout = {
        tables: layout.tables.map((table) => ({ ...table, seats: [...table.seats] })),
        tray: [...layout.tray],
    };
    const put = (spot: Spot, player: string) => {
        if ("tray" in spot) next.tray[spot.tray] = player;
        else next.tables[spot.table].seats[spot.seat] = player;
    };
    put(spotOf(layout, a)!, b);
    put(spotOf(layout, b)!, a);
    return next;
}

/**
 * Whether a table has a free seat somebody could take
 *
 * A short pod has one, and so does the bye at a duel event: a second player turns it into a table.
 *
 * @param table the table
 * @param podSize how many a full table seats
 *
 * @returns whether there is room
 */
export function hasFreeSeat(table: EditTable, podSize: number): boolean {
    return !table.locked && table.seats.length < podSize;
}

/**
 * Whether somebody may move onto a table's free seat without leaving a table the wrong size behind
 *
 * @param layout the layout
 * @param player who would move
 * @param target index of the table they would move to
 * @param podSize how many a full table seats
 *
 * @returns whether the move keeps every table legal
 */
export function canMove(layout: EditLayout, player: string, target: number, podSize: number): boolean {
    const spot = spotOf(layout, player);
    const table = layout.tables[target];
    if (spot === null || table === undefined || !hasFreeSeat(table, podSize) || !isMovable(layout, player)) {
        return false;
    }
    if ("tray" in spot) return true;
    if (spot.table === target) return false;
    // Leaving a duel would strand the opponent on a second bye; leaving a full pod leaves a short one.
    return podSize > 2 && layout.tables[spot.table].seats.length === podSize;
}

/**
 * Moves somebody onto a table's free seat
 *
 * @param layout the layout
 * @param player who moves
 * @param target index of the table
 * @param podSize how many a full table seats
 *
 * @returns the new layout, or the old one when the move is not allowed
 */
export function move(layout: EditLayout, player: string, target: number, podSize: number): EditLayout {
    if (!canMove(layout, player, target, podSize)) return layout;
    const next: EditLayout = {
        tables: layout.tables.map((table) => ({ ...table, seats: table.seats.filter((seat) => seat !== player) })),
        tray: layout.tray.filter((seat) => seat !== player),
    };
    next.tables[target].seats.push(player);
    return next;
}

/**
 * Who sits somewhere else than they did
 *
 * @param before the layout the edit started from
 * @param after the layout now
 *
 * @returns everybody whose table or tray membership changed
 */
export function movedPlayers(before: EditLayout, after: EditLayout): Set<string> {
    const where = (layout: EditLayout) => {
        const map = new Map<string, string>();
        for (const table of layout.tables) for (const seat of table.seats) map.set(seat, table.key);
        for (const seat of layout.tray) map.set(seat, "tray");
        return map;
    };
    const a = where(before);
    const moved = new Set<string>();
    for (const [player, table] of where(after)) if (a.get(player) !== table) moved.add(player);
    return moved;
}

/**
 * Whether two players at a table have met before
 *
 * @param table the table
 * @param meetings earlier pairs, unordered
 *
 * @returns whether the table is a rematch
 */
export function isRematch(table: EditTable, meetings: Array<[string, string]>): boolean {
    return meetings.some(([a, b]) => table.seats.includes(a) && table.seats.includes(b));
}

/**
 * The layout as the server takes it: every table with anybody at it, in shown order
 *
 * @param layout the layout
 *
 * @returns who sits where, table by table
 */
export function toRequest(layout: EditLayout): Array<Array<string>> {
    return layout.tables.filter((table) => table.seats.length > 0).map((table) => table.seats);
}
