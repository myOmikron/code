/**
 * What the life tracker remembers about a table, and how it seats one.
 *
 * A seat is a direction, not a rotation class: a tile is drawn in the frame of
 * the player who reads it, so it turns itself and puts its buttons at the two
 * ends of that player's horizontal. That is what keeps the plus under the same
 * hand at every edge of the device, and, seen from above, keeps the buttons on
 * the long side of every tile.
 */

/** How the seats are spread across the screen */
export type LifeArrangement = "sides" | "cross";

/** The seat counts on offer, from a duel to a full commander pod */
export const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const;

/** The usual constructed and commander starting totals, offered as shortcuts */
export const STARTING_LIFE_TOTALS = [20, 30, 40] as const;

/** What a starting total may be typed between */
export const STARTING_LIFE_RANGE = { min: 1, max: 999 } as const;

/**
 * Whether a game can be started on a total.
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

/** How much commander damage from a single commander takes a player out */
export const COMMANDER_DAMAGE_LETHAL = 21;

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
 * Whether a player is out of the game.
 *
 * The tracker only greys their tile out for it; nothing stops them counting
 * further, since a table often keeps a player around while a stack resolves.
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
 * A table nobody has been hit on yet.
 *
 * @param playerCount how many are playing
 *
 * @returns what every player has taken from every commander, all zero
 */
export function emptyCommanderDamage(playerCount: number): Array<Array<number>> {
    return Array.from({ length: playerCount }, () => Array<number>(playerCount).fill(0));
}

/**
 * Seats more or fewer players without losing what the ones already seated took.
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

/** One player's tile */
export type SeatPlacement = {
    /** The edge the tile is read from */
    seat: Seat;
    /** Where the tile sits on the table's grid */
    area: string;
};

/** A whole table's worth of tiles */
export type Seating = {
    /** The grid the tiles are placed on */
    grid: string;
    /** Whether the tiles butt against each other instead of standing apart */
    flush: boolean;
    /** One placement per player, in seat order */
    seats: Array<SeatPlacement>;
};

/**
 * Players one and three take the deep middle band and collide along its centre
 * line, read from the left and the right; two and four lie on the top and
 * bottom edges, across the short sides of the pair.
 */
const CROSS: Seating = {
    grid: "grid-cols-2 grid-rows-[minmax(0,1fr)_minmax(0,2.4fr)_minmax(0,1fr)]",
    flush: true,
    seats: [
        { seat: "left", area: "col-start-1 row-start-2" },
        { seat: "top", area: "col-span-2 row-start-1" },
        { seat: "right", area: "col-start-2 row-start-2" },
        { seat: "bottom", area: "col-span-2 row-start-3" },
    ],
};

/**
 * Everyone along the two long sides, which is how a phone lies between players.
 *
 * The seats run clockwise from the top left, the way players are counted around
 * a table. Two and three still face each other across it: with that few tiles
 * there is room for a full-width row, and a row read from the near edge beats a
 * turned one.
 */
const SIDES: Record<number, Seating> = {
    2: {
        grid: "grid-cols-1 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "row-start-1" },
            { seat: "bottom", area: "row-start-2" },
        ],
    },
    3: {
        grid: "grid-cols-2 grid-rows-2",
        flush: false,
        seats: [
            { seat: "top", area: "col-span-2 row-start-1" },
            { seat: "bottom", area: "col-start-2 row-start-2" },
            { seat: "bottom", area: "col-start-1 row-start-2" },
        ],
    },
    4: {
        grid: "grid-cols-2 grid-rows-2",
        flush: false,
        seats: [
            { seat: "left", area: "col-start-1 row-start-1" },
            { seat: "right", area: "col-start-2 row-start-1" },
            { seat: "right", area: "col-start-2 row-start-2" },
            { seat: "left", area: "col-start-1 row-start-2" },
        ],
    },
    5: {
        grid: "grid-cols-2 grid-rows-3",
        flush: false,
        seats: [
            { seat: "left", area: "col-start-1 row-start-1" },
            { seat: "right", area: "col-start-2 row-start-1" },
            { seat: "right", area: "col-start-2 row-start-2" },
            { seat: "bottom", area: "col-span-2 row-start-3" },
            { seat: "left", area: "col-start-1 row-start-2" },
        ],
    },
    6: {
        grid: "grid-cols-2 grid-rows-3",
        flush: false,
        seats: [
            { seat: "left", area: "col-start-1 row-start-1" },
            { seat: "right", area: "col-start-2 row-start-1" },
            { seat: "right", area: "col-start-2 row-start-2" },
            { seat: "right", area: "col-start-2 row-start-3" },
            { seat: "left", area: "col-start-1 row-start-3" },
            { seat: "left", area: "col-start-1 row-start-2" },
        ],
    },
};

/**
 * Lays a table out.
 *
 * @param playerCount how many are playing
 * @param arrangement how they sit around the device
 *
 * @returns the grid and one placement per player; the cross falls back to the
 *   sides for any pod it was not built for
 */
export function seatingFor(playerCount: number, arrangement: LifeArrangement): Seating {
    if (arrangement === "cross" && playerCount === CROSS_PLAYER_COUNT) return CROSS;
    return SIDES[playerCount] ?? SIDES[CROSS_PLAYER_COUNT];
}

/** How a device is set up for the table it sits on */
export type LifeTrackerSettings = {
    /** What everyone starts on */
    startingLife: number;
    /** How many are playing */
    playerCount: number;
    /** How they sit around the device */
    arrangement: LifeArrangement;
    /** Whether the screen is kept on while the tracker is open */
    keepAwake: boolean;
};

/** What a device without stored settings opens on: a commander pod */
export const DEFAULT_LIFE_TRACKER_SETTINGS: LifeTrackerSettings = {
    startingLife: 40,
    playerCount: 4,
    arrangement: "sides",
    keepAwake: true,
};

const STORAGE_KEY = "cardlens.life-tracker.v1";

/**
 * Reads and validates the stored setup.
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
            keepAwake:
                typeof stored.keepAwake === "boolean" ? stored.keepAwake : DEFAULT_LIFE_TRACKER_SETTINGS.keepAwake,
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
        // State still keeps the choice for this tab when storage is unavailable.
    }
}
