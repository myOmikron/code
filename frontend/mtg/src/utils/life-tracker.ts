/**
 * What the life tracker remembers about a table, and how it seats one.
 *
 * A seat is the edge a tile is read from; every tile reads along its longer side, so the
 * seatings differ per orientation. A solo tile is always read upright.
 */

/** How the seats are spread across the screen */
export type LifeArrangement = "sides" | "cross";

/** The seat counts on offer, from counting alone to a full commander pod */
export const PLAYER_COUNTS = [1, 2, 3, 4, 5, 6] as const;

/** The usual starting totals, offered as shortcuts: constructed, two-headed giant, commander, archenemy */
export const STARTING_LIFE_TOTALS = [20, 30, 40, 60] as const;

/** What a starting total may be typed between */
export const STARTING_LIFE_RANGE = { min: 1, max: 999 } as const;

/**
 * Whether a game can be started on a total
 *
 * @param total what was typed or read back
 *
 * @returns whether it is a whole total inside {@link STARTING_LIFE_RANGE}
 */
export function isStartingLife(total: unknown): total is number {
    return (
        typeof total === "number" &&
        Number.isInteger(total) &&
        total >= STARTING_LIFE_RANGE.min &&
        total <= STARTING_LIFE_RANGE.max
    );
}

/** The pod size the cross is built for: one player per edge */
export const CROSS_PLAYER_COUNT = 4;

/** The table of a player keeping their own total, with nobody sitting opposite */
export const SOLO_PLAYER_COUNT = 1;

/** How much commander damage from a single commander takes a player out */
export const COMMANDER_DAMAGE_LETHAL = 21;

/** How long after a hit, in milliseconds, opening the drawer still offers to rebook it */
export const REBOOK_REACTION = 2500;

/** How long the offer stands once the drawer shows it, in milliseconds */
export const REBOOK_LINGER = 5000;

/** Life a player lost through taps on their tile that no commander has been charged for yet */
export type LooseHit = {
    /** What the run of taps cost them, as a positive number */
    amount: number;
    /** Unix timestamp in milliseconds of the last tap in that run */
    at: number;
};

/**
 * Folds a life change into the hit a player is carrying
 *
 * Taps within {@link REBOOK_REACTION} of each other add up to one hit; any gain clears it.
 *
 * @param hit what they were carrying, if anything
 * @param amount what was just added to their total, negative for a hit
 * @param now when it happened
 *
 * @returns the hit they carry now, or `undefined` when there is nothing to
 *   rebook
 */
export function trackHit(hit: LooseHit | undefined, amount: number, now: number): LooseHit | undefined {
    if (amount >= 0) return undefined;

    const running = hit !== undefined && now - hit.at <= REBOOK_REACTION ? hit.amount : 0;
    return { amount: running - amount, at: now };
}

/**
 * Records or drops the hit one player is carrying
 *
 * @param hits what the whole table is carrying
 * @param player whose hit changed, counted from zero
 * @param hit what they carry now, or `undefined` to drop it
 *
 * @returns the table's hits with that one seat rewritten
 */
export function withHit(
    hits: Record<number, LooseHit>,
    player: number,
    hit: LooseHit | undefined,
): Record<number, LooseHit> {
    const next = { ...hits };
    if (hit === undefined) delete next[player];
    else next[player] = hit;
    return next;
}

/**
 * What a drawer opening now would offer to rebook
 *
 * @param hit what the player is carrying, if anything
 * @param now when the drawer was opened
 *
 * @returns the amount to offer, or `undefined` when the drawer was not opened
 *   on the back of a hit
 */
export function rebookableHit(hit: LooseHit | undefined, now: number): number | undefined {
    if (hit === undefined || hit.amount <= 0) return undefined;
    return now - hit.at <= REBOOK_REACTION ? hit.amount : undefined;
}

/** Distinct at a glance, including with the device lying flat on the table */
export const SEAT_COLORS = [
    "from-blue-600 to-blue-950",
    "from-rose-600 to-rose-950",
    "from-emerald-600 to-emerald-950",
    "from-amber-500 to-amber-900",
    "from-violet-600 to-violet-950",
    "from-cyan-600 to-cyan-950",
] as const;

/**
 * Whether a player is out of the game; the tile only greys out, counting goes on
 *
 * @param life what they are on
 * @param damage what every commander has put on them
 *
 * @returns whether they are on nothing, or carrying a lethal helping from one
 *   commander
 */
export function isEliminated(life: number, damage: Array<number>): boolean {
    return life <= 0 || damage.some((taken) => taken >= COMMANDER_DAMAGE_LETHAL);
}

/**
 * A table nobody has been hit on yet
 *
 * @param playerCount how many are playing
 *
 * @returns what every player has taken from every commander, all zero
 */
export function emptyCommanderDamage(playerCount: number): Array<Array<number>> {
    return Array.from({ length: playerCount }, () => Array<number>(playerCount).fill(0));
}

/**
 * Seats more or fewer players without losing what the ones already seated took
 *
 * @param current what has been dealt so far
 * @param playerCount how many are playing now
 *
 * @returns the damage table for the new pod
 */
export function resizeCommanderDamage(current: Array<Array<number>>, playerCount: number): Array<Array<number>> {
    return Array.from({ length: playerCount }, (_, player) =>
        Array.from({ length: playerCount }, (_, opponent) => current[player]?.[opponent] ?? 0),
    );
}

/** Which edge of the device a player reads their tile from */
export type Seat = "top" | "right" | "bottom" | "left";

/** Which way round the screen the table is played on lies */
export type TableOrientation = "landscape" | "portrait";

/** A point on the table, in fractions of the screen, with y running downwards */
export type Spot = {
    /** How far across */
    x: number;
    /** How far down */
    y: number;
};

/** One player's tile */
export type SeatPlacement = {
    /** The edge the tile is read from */
    seat: Seat;
    /** Where the tile sits on the table's grid */
    area: string;
    /** The middle of the tile; in seat order these wind clockwise, which {@link opponentOrder} relies on */
    center: Spot;
};

/** A whole table's worth of tiles */
export type Seating = {
    /** The grid the tiles are placed on */
    grid: string;
    /** Whether the tiles butt against each other instead of standing apart */
    flush: boolean;
    /** One placement per player, in seat order, which runs clockwise */
    seats: Array<SeatPlacement>;
};

/** A player counting on their own: one upright tile, whatever the orientation */
const SOLO: Seating = {
    grid: "grid-cols-1 grid-rows-1",
    flush: false,
    seats: [{ seat: "bottom", area: "col-start-1 row-start-1", center: { x: 0.5, y: 0.5 } }],
};

/** One player per edge: one and three read from the left and right, two and four from top and bottom */
const CROSS: Seating = {
    grid: "grid-cols-2 grid-rows-[minmax(0,1fr)_minmax(0,2.4fr)_minmax(0,1fr)]",
    flush: true,
    seats: [
        { seat: "left", area: "col-start-1 row-start-2", center: { x: 0.25, y: 0.5 } },
        { seat: "top", area: "col-span-2 row-start-1", center: { x: 0.5, y: 0.11 } },
        { seat: "right", area: "col-start-2 row-start-2", center: { x: 0.75, y: 0.5 } },
        { seat: "bottom", area: "col-span-2 row-start-3", center: { x: 0.5, y: 0.89 } },
    ],
};

/** The pods on a landscape screen: every tile is wide, so players sit on the top and bottom edges */
const LANDSCAPE: Record<number, Seating> = {
    2: {
        grid: "grid-cols-1 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "row-start-1", center: { x: 0.5, y: 0.25 } },
            { seat: "bottom", area: "row-start-2", center: { x: 0.5, y: 0.75 } },
        ],
    },
    3: {
        grid: "grid-cols-2 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "col-span-2 row-start-1", center: { x: 0.5, y: 0.25 } },
            { seat: "bottom", area: "col-start-2 row-start-2", center: { x: 0.75, y: 0.75 } },
            { seat: "bottom", area: "col-start-1 row-start-2", center: { x: 0.25, y: 0.75 } },
        ],
    },
    4: {
        grid: "grid-cols-2 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "col-start-1 row-start-1", center: { x: 0.25, y: 0.25 } },
            { seat: "top", area: "col-start-2 row-start-1", center: { x: 0.75, y: 0.25 } },
            { seat: "bottom", area: "col-start-2 row-start-2", center: { x: 0.75, y: 0.75 } },
            { seat: "bottom", area: "col-start-1 row-start-2", center: { x: 0.25, y: 0.75 } },
        ],
    },
    5: {
        grid: "grid-cols-6 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "col-span-2 col-start-1 row-start-1", center: { x: 0.17, y: 0.25 } },
            { seat: "top", area: "col-span-2 col-start-3 row-start-1", center: { x: 0.5, y: 0.25 } },
            { seat: "top", area: "col-span-2 col-start-5 row-start-1", center: { x: 0.83, y: 0.25 } },
            { seat: "bottom", area: "col-span-3 col-start-4 row-start-2", center: { x: 0.75, y: 0.75 } },
            { seat: "bottom", area: "col-span-3 col-start-1 row-start-2", center: { x: 0.25, y: 0.75 } },
        ],
    },
    6: {
        grid: "grid-cols-3 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "col-start-1 row-start-1", center: { x: 0.17, y: 0.25 } },
            { seat: "top", area: "col-start-2 row-start-1", center: { x: 0.5, y: 0.25 } },
            { seat: "top", area: "col-start-3 row-start-1", center: { x: 0.83, y: 0.25 } },
            { seat: "bottom", area: "col-start-3 row-start-2", center: { x: 0.83, y: 0.75 } },
            { seat: "bottom", area: "col-start-2 row-start-2", center: { x: 0.5, y: 0.75 } },
            { seat: "bottom", area: "col-start-1 row-start-2", center: { x: 0.17, y: 0.75 } },
        ],
    },
};

/** The pods on a portrait screen: tall tiles are read from their long edge, full-width ones from top or bottom */
const PORTRAIT: Record<number, Seating> = {
    2: {
        grid: "grid-cols-1 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "row-start-1", center: { x: 0.5, y: 0.25 } },
            { seat: "bottom", area: "row-start-2", center: { x: 0.5, y: 0.75 } },
        ],
    },
    3: {
        grid: "grid-cols-2 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "col-span-2 row-start-1", center: { x: 0.5, y: 0.25 } },
            { seat: "right", area: "col-start-2 row-start-2", center: { x: 0.75, y: 0.75 } },
            { seat: "left", area: "col-start-1 row-start-2", center: { x: 0.25, y: 0.75 } },
        ],
    },
    4: {
        grid: "grid-cols-2 grid-rows-2",
        flush: false,
        seats: [
            { seat: "left", area: "col-start-1 row-start-1", center: { x: 0.25, y: 0.25 } },
            { seat: "right", area: "col-start-2 row-start-1", center: { x: 0.75, y: 0.25 } },
            { seat: "right", area: "col-start-2 row-start-2", center: { x: 0.75, y: 0.75 } },
            { seat: "left", area: "col-start-1 row-start-2", center: { x: 0.25, y: 0.75 } },
        ],
    },
    5: {
        grid: "grid-cols-2 grid-rows-3",
        flush: false,
        seats: [
            { seat: "left", area: "col-start-1 row-start-1", center: { x: 0.25, y: 0.17 } },
            { seat: "right", area: "col-start-2 row-start-1", center: { x: 0.75, y: 0.17 } },
            { seat: "right", area: "col-start-2 row-start-2", center: { x: 0.75, y: 0.5 } },
            { seat: "bottom", area: "col-span-2 row-start-3", center: { x: 0.5, y: 0.83 } },
            { seat: "left", area: "col-start-1 row-start-2", center: { x: 0.25, y: 0.5 } },
        ],
    },
    6: {
        grid: "grid-cols-2 grid-rows-3",
        flush: false,
        seats: [
            { seat: "left", area: "col-start-1 row-start-1", center: { x: 0.25, y: 0.17 } },
            { seat: "right", area: "col-start-2 row-start-1", center: { x: 0.75, y: 0.17 } },
            { seat: "right", area: "col-start-2 row-start-2", center: { x: 0.75, y: 0.5 } },
            { seat: "right", area: "col-start-2 row-start-3", center: { x: 0.75, y: 0.83 } },
            { seat: "left", area: "col-start-1 row-start-3", center: { x: 0.25, y: 0.83 } },
            { seat: "left", area: "col-start-1 row-start-2", center: { x: 0.25, y: 0.5 } },
        ],
    },
};

/**
 * Lays a table out
 *
 * @param playerCount how many are playing
 * @param arrangement how they sit around the device
 * @param orientation which way round the screen is
 *
 * @returns the grid and one placement per player; the cross falls back to the
 *   sides for any pod it was not built for
 */
export function seatingFor(playerCount: number, arrangement: LifeArrangement, orientation: TableOrientation): Seating {
    if (playerCount === SOLO_PLAYER_COUNT) return SOLO;
    if (arrangement === "cross" && playerCount === CROSS_PLAYER_COUNT) return CROSS;

    const sides = orientation === "portrait" ? PORTRAIT : LANDSCAPE;
    return sides[playerCount] ?? sides[CROSS_PLAYER_COUNT];
}

/**
 * The other players, in the order their turns come after this one
 *
 * A rotation of the seat numbers, since seats are numbered clockwise.
 *
 * @param seats the whole table, in seat order
 * @param player whose seat the table is read from, counted from zero
 *
 * @returns every other seat's index, clockwise from that seat
 */
export function opponentOrder(seats: Array<SeatPlacement>, player: number): Array<number> {
    if (seats[player] === undefined) return [];
    return Array.from({ length: seats.length - 1 }, (_, step) => (player + 1 + step) % seats.length);
}

/** How a device is set up for the table it sits on */
export type LifeTrackerSettings = {
    /** What everyone starts on */
    startingLife: number;
    /** How many are playing */
    playerCount: number;
    /** How they sit around the device */
    arrangement: LifeArrangement;
    /** Whether the drawer offers the hit a player has just taken as commander damage */
    rebook: boolean;
};

/** What a device without stored settings opens on: a commander pod */
export const DEFAULT_LIFE_TRACKER_SETTINGS: LifeTrackerSettings = {
    startingLife: 40,
    playerCount: 4,
    arrangement: "sides",
    rebook: true,
};

const STORAGE_KEY = "cardlens.life-tracker.v1";

/**
 * Reads and validates the stored setup
 *
 * @returns valid settings with field-level defaults
 */
export function loadLifeTrackerSettings(): LifeTrackerSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return DEFAULT_LIFE_TRACKER_SETTINGS;
        const stored = JSON.parse(raw) as Partial<LifeTrackerSettings>;
        return {
            startingLife: isStartingLife(stored.startingLife)
                ? stored.startingLife
                : DEFAULT_LIFE_TRACKER_SETTINGS.startingLife,
            playerCount:
                PLAYER_COUNTS.find((count) => count === stored.playerCount) ??
                DEFAULT_LIFE_TRACKER_SETTINGS.playerCount,
            arrangement: stored.arrangement === "cross" ? "cross" : DEFAULT_LIFE_TRACKER_SETTINGS.arrangement,
            // Older setups have no field; only an explicit `false` turns it off.
            rebook: stored.rebook !== false,
        };
    } catch {
        return DEFAULT_LIFE_TRACKER_SETTINGS;
    }
}

/**
 * Writes the setup, tolerating unavailable browser storage
 *
 * @param settings the complete setup to retain
 */
export function saveLifeTrackerSettings(settings: LifeTrackerSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Storage unavailable: kept for this tab only.
    }
}

/** Everything the pod has counted, kept together so one tap settles it at once */
export type Table = {
    /** Everyone's total, in seat order */
    life: Array<number>;
    /** What every seat's commander has put on every player */
    damage: Array<Array<number>>;
    /** What the last run of taps came to, per player */
    deltas: Record<number, number>;
    /** The hit each player is carrying that no commander has been charged for */
    hits: Record<number, LooseHit>;
};

const GAME_STORAGE_KEY = "cardlens.life-tracker.game.v1";

/** How long a stored game is still resumed: an evening, not until the next game night */
const GAME_MAX_AGE = 12 * 60 * 60 * 1000;

/** A stored table, plus when it was last counted on */
type StoredGame = {
    life: Array<number>;
    damage: Array<Array<number>>;
    /** Unix timestamp in milliseconds of the last change */
    at: number;
    /** The tournament table it was counted for, absent for a casual game */
    key?: string;
};

/**
 * A table nobody has counted on yet
 *
 * @param settings the pod this device is set up for
 *
 * @returns everyone on the starting total, nothing dealt
 */
export function freshTable(settings: LifeTrackerSettings): Table {
    return {
        life: Array<number>(settings.playerCount).fill(settings.startingLife),
        damage: emptyCommanderDamage(settings.playerCount),
        deltas: {},
        hits: {},
    };
}

/**
 * Reads back the game this device was in the middle of, fitted to the pod the settings describe
 *
 * @param settings the pod this device is set up for
 * @param key the tournament table being counted, absent for a casual game
 *
 * @returns the game to carry on with, or `null` when there is none worth
 *   resuming: no stored table, one that does not read as a table, one counted
 *   for a different table, or one old enough that the game it belongs to is over
 */
export function loadLifeTrackerGame(settings: LifeTrackerSettings, key?: string): Table | null {
    try {
        const raw = localStorage.getItem(GAME_STORAGE_KEY);
        if (raw === null) return null;
        const stored = JSON.parse(raw) as Partial<StoredGame>;

        if (typeof stored.at !== "number" || Date.now() - stored.at > GAME_MAX_AGE) return null;
        if (stored.key !== key) return null;

        const life = stored.life;
        if (!isTotals(life) || !isDamage(stored.damage, life.length)) return null;

        const { playerCount } = settings;
        return {
            life: Array.from({ length: playerCount }, (_, player) => life[player] ?? settings.startingLife),
            damage: resizeCommanderDamage(stored.damage, playerCount),
            // Both are short-lived and their fade timers did not survive the reload.
            deltas: {},
            hits: {},
        };
    } catch {
        return null;
    }
}

/**
 * Writes the table, tolerating unavailable browser storage
 *
 * @param table what the pod is on now
 * @param key the tournament table being counted, absent for a casual game
 */
export function saveLifeTrackerGame(table: Table, key?: string): void {
    try {
        const stored: StoredGame = { life: table.life, damage: table.damage, at: Date.now(), key };
        localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(stored));
    } catch {
        // Storage unavailable: kept for this tab only.
    }
}

/**
 * Whether stored totals read as a seated pod; totals may be negative
 *
 * @param value what was stored as everyone's total
 *
 * @returns whether it is a non-empty row of whole numbers
 */
function isTotals(value: unknown): value is Array<number> {
    return Array.isArray(value) && value.length > 0 && value.every((total) => Number.isInteger(total));
}

/**
 * Whether stored commander damage reads as a square of what the pod dealt
 *
 * @param value what was stored as the damage between the players
 * @param playerCount how many totals it has to line up with
 *
 * @returns whether it is that many rows of that many tallies, none negative
 */
function isDamage(value: unknown, playerCount: number): value is Array<Array<number>> {
    return (
        Array.isArray(value) &&
        value.length === playerCount &&
        value.every(
            (row) =>
                Array.isArray(row) &&
                row.length === playerCount &&
                row.every((taken) => Number.isInteger(taken) && taken >= 0),
        )
    );
}

/**
 * Rotates a table's seat order so the device's owner gets the bottom tile, keeping turn order
 *
 * @param names everybody at the table, in seat order
 * @param me which of them holds the device
 * @param seats the seating the tiles are laid out in
 *
 * @returns one name per tile
 */
export function seatFromBottom(names: Array<string>, me: number, seats: Array<SeatPlacement>): Array<string> {
    const bottom = seats.findIndex((placement) => placement.seat === "bottom");
    if (bottom < 0 || me < 0 || seats.length !== names.length) return names;
    const count = names.length;
    return Array.from({ length: count }, (_, tile) => names[(tile - bottom + me + count) % count]);
}
