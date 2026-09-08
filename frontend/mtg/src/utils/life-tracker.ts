/**
 * What the life tracker remembers about a table, and how it seats one.
 *
 * A seat is a direction, not a rotation class: a tile is drawn in the frame of
 * the player who reads it, so it turns itself and puts its buttons at the two
 * ends of that player's horizontal. That is what keeps the plus under the same
 * hand at every edge of the device, and, seen from above, keeps the buttons on
 * the long side of every tile.
 *
 * Which way a tile is turned follows the shape it was given: every tile reads
 * along its own longer side, so a wide tile is read across the screen and a
 * tall one along it. A screen lying in landscape therefore seats its players on
 * the top and bottom edges, and the same pod on a phone held upright seats them
 * left and right — the tables below are the two halves of that, one per
 * orientation.
 *
 * A player counting on their own is the exception to all of it: there is no
 * table to read the screen across, so the one tile is read upright, whichever
 * way round the device is and whatever shape that leaves it.
 */

/** How the seats are spread across the screen */
export type LifeArrangement = "sides" | "cross";

/** The seat counts on offer, from counting alone to a full commander pod */
export const PLAYER_COUNTS = [1, 2, 3, 4, 5, 6] as const;

/**
 * The usual starting totals, offered as shortcuts: constructed, two-headed
 * giant, commander, and the archenemy the rest of the pod is ganging up on
 */
export const STARTING_LIFE_TOTALS = [20, 30, 40, 60] as const;

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

/** The table of a player keeping their own total, with nobody sitting opposite */
export const SOLO_PLAYER_COUNT = 1;

/** How much commander damage from a single commander takes a player out */
export const COMMANDER_DAMAGE_LETHAL = 21;

/**
 * How long after a hit the drawer still opens on it.
 *
 * The window is a reaction time, not a grace period: it is how long it takes a
 * player to hit their tile, register that the swing came in over a commander,
 * and reach for the shield. Two and a half seconds covers the realisation and
 * the second tap without stretching to cover a player who opened the drawer for
 * an unrelated reason a beat later.
 */
export const REBOOK_REACTION = 2500;

/**
 * How long the offer stands once the drawer is showing it.
 *
 * Longer than the window that armed it, because this is the part that is read
 * and acted on: the player still has to find the column of the commander that
 * hit them. The spindown around the amount counts this down, so the offer never
 * disappears out from under a thumb without warning.
 */
export const REBOOK_LINGER = 5000;

/**
 * Life a player has lost that no commander has been charged for yet.
 *
 * Only taps on their own tile leave one. Damage booked in the drawer already
 * has a commander against it, and life gained is nobody's hit, so both clear
 * whatever was standing.
 */
export type LooseHit = {
    /** What the run of taps cost them, as a positive number */
    amount: number;
    /** Unix timestamp in milliseconds of the last tap in that run */
    at: number;
};

/**
 * Folds a life change into the hit a player is carrying.
 *
 * A run of taps counts as one hit for as long as the taps keep coming inside
 * {@link REBOOK_REACTION} of each other: three taps of one are the same swing
 * of three, and offering the whole run is what the player means by "that".
 *
 * @param hit what they were carrying, if anything
 * @param amount what was just added to their total, negative for a hit
 * @param now when it happened
 *
 * @returns the hit they carry now, or `undefined` when there is nothing to
 *   rebook
 */
export function trackHit(hit: LooseHit | undefined, amount: number, now: number): LooseHit | undefined {
    // Life gained is a trigger, a lifelink swing or a slip being taken back —
    // whatever came before it is no longer the thing the player is thinking of.
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
 * What a drawer opening now would offer to rebook.
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
    /** The middle of that tile, which is where the player reading it sits */
    center: Spot;
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
 * A player counting on their own: one tile, the whole screen.
 *
 * The only seating that the shape of the screen has no say in. A tile is turned
 * so that the player it belongs to can read it from where they sit, and someone
 * counting alone reads the device the way they are holding it — upright, on a
 * phone standing tall as much as on a tablet lying the long way round.
 */
const SOLO: Seating = {
    grid: "grid-cols-1 grid-rows-1",
    flush: false,
    seats: [{ seat: "bottom", area: "col-start-1 row-start-1", center: { x: 0.5, y: 0.5 } }],
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
        { seat: "left", area: "col-start-1 row-start-2", center: { x: 0.25, y: 0.5 } },
        { seat: "top", area: "col-span-2 row-start-1", center: { x: 0.5, y: 0.11 } },
        { seat: "right", area: "col-start-2 row-start-2", center: { x: 0.75, y: 0.5 } },
        { seat: "bottom", area: "col-span-2 row-start-3", center: { x: 0.5, y: 0.89 } },
    ],
};

/**
 * The pod on a screen that is wider than it is tall: a laptop, or a tablet
 * lying the long way round.
 *
 * Every tile here is wider than it is tall, so every tile is read across the
 * screen and the players line up along its top and bottom edges. The seats run
 * clockwise from the top left, the way players are counted around a table.
 *
 * Five and six get a row of three rather than a column of two: three tiles
 * side by side on a wide screen are still wider than they are tall, where a
 * two-column grid three rows deep would squeeze them into letterbox slots.
 */
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

/**
 * The same pods on a screen that is taller than it is wide: a phone or a tablet
 * held upright.
 *
 * The grid is the one the tiles were always laid out on; what changes is which
 * way they are read. A tile that is now taller than it is wide is read along
 * the screen instead of across it, and its player sits on the near long edge —
 * left for the left-hand column, right for the right-hand one. A tile that
 * still spans the full width stays a row read from the top or the bottom, which
 * is why two players facing each other across an upright phone keep doing so.
 */
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
 * Lays a table out.
 *
 * @param playerCount how many are playing
 * @param arrangement how they sit around the device
 * @param orientation which way round the screen is
 *
 * @returns the grid and one placement per player; the cross falls back to the
 *   sides for any pod it was not built for
 */
export function seatingFor(playerCount: number, arrangement: LifeArrangement, orientation: TableOrientation): Seating {
    // Neither of these follows the screen: the cross is a seating plan — one
    // player per edge is what it means, whichever way round the device lies —
    // and the solo table has nobody to be turned towards.
    if (playerCount === SOLO_PLAYER_COUNT) return SOLO;
    if (arrangement === "cross" && playerCount === CROSS_PLAYER_COUNT) return CROSS;

    const sides = orientation === "portrait" ? PORTRAIT : LANDSCAPE;
    return sides[playerCount] ?? sides[CROSS_PLAYER_COUNT];
}

/**
 * Which way a player at a seat faces, in table coordinates.
 *
 * It is the way their tile is turned: they sit at that edge and look across the
 * device at the rest of the table.
 */
const FACING: Record<Seat, Spot> = {
    top: { x: 0, y: 1 },
    bottom: { x: 0, y: -1 },
    left: { x: 1, y: 0 },
    right: { x: -1, y: 0 },
};

/**
 * How far along an axis a tile sits
 *
 * @param placement the tile
 * @param axis a unit direction in table coordinates
 *
 * @returns the tile's centre projected onto that direction
 */
function along(placement: SeatPlacement, axis: Spot): number {
    return placement.center.x * axis.x + placement.center.y * axis.y;
}

/**
 * The other players, in the order they sit in front of one of them.
 *
 * Commander damage is booked under an opponent's colour and name, and at a
 * table the quickest way to find one of those is to look up: the columns
 * therefore run left to right the way the players themselves do, seen from the
 * seat that is reading them. Seat order would put the same opponent in a
 * different column for every player, since each of them reads the table from a
 * different edge.
 *
 * Two opponents on the same bearing — the pair sharing a column of the grid —
 * are ordered far side first, the way the rows above are read before the ones
 * nearer to hand.
 *
 * @param seats the whole table, in seat order
 * @param player whose seat the table is read from, counted from zero
 *
 * @returns every other seat's index, left to right from that seat
 */
export function opponentOrder(seats: Array<SeatPlacement>, player: number): Array<number> {
    const self = seats[player];
    if (self === undefined) return [];

    const facing = FACING[self.seat];
    const right: Spot = { x: -facing.y, y: facing.x };

    return seats
        .map((_, opponent) => opponent)
        .filter((opponent) => opponent !== player)
        .sort(
            (one, other) =>
                along(seats[one], right) - along(seats[other], right) ||
                along(seats[other], facing) - along(seats[one], facing),
        );
}

/** How a device is set up for the table it sits on */
export type LifeTrackerSettings = {
    /** What everyone starts on */
    startingLife: number;
    /** How many are playing */
    playerCount: number;
    /** How they sit around the device */
    arrangement: LifeArrangement;
    /**
     * Whether the drawer offers the hit a player has just taken as commander
     * damage
     */
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
            // On unless it was turned off: anything that is not a stored `false`
            // — a missing field on a setup from before the offer existed
            // included — is a table that has never said no to it.
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
        // State still keeps the choice for this tab when storage is unavailable.
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

/**
 * How long a table left standing is still the game being played.
 *
 * Nobody resumes yesterday's game, and a counter that silently opens on totals
 * from the last game night is worse than one that starts fresh. Long enough to
 * cover an evening of commander, including the break in the middle.
 */
const GAME_MAX_AGE = 12 * 60 * 60 * 1000;

/** A stored table, plus when it was last counted on */
type StoredGame = {
    life: Array<number>;
    damage: Array<Array<number>>;
    /** Unix timestamp in milliseconds of the last change */
    at: number;
};

/**
 * A table nobody has counted on yet.
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
 * Reads back the game this device was in the middle of.
 *
 * The totals outlive the page because losing them is not recoverable: a table
 * cannot reconstruct what four players are on. The reload that takes them is
 * usually nobody's doing — a deploy activates the new service worker and the
 * app reloads itself, and a tablet drops a backgrounded tab whenever it wants
 * the memory back.
 *
 * The stored table is fitted to the pod the settings describe, the same way
 * seating more or fewer players does it, so the caller keeps its invariant of
 * one total per seat however the two came apart.
 *
 * @param settings the pod this device is set up for
 *
 * @returns the game to carry on with, or `null` when there is none worth
 *   resuming: no stored table, one that does not read as a table, or one old
 *   enough that the game it belongs to is over
 */
export function loadLifeTrackerGame(settings: LifeTrackerSettings): Table | null {
    try {
        const raw = localStorage.getItem(GAME_STORAGE_KEY);
        if (raw === null) return null;
        const stored = JSON.parse(raw) as Partial<StoredGame>;

        if (typeof stored.at !== "number" || Date.now() - stored.at > GAME_MAX_AGE) return null;

        const life = stored.life;
        if (!isTotals(life) || !isDamage(stored.damage, life.length)) return null;

        const { playerCount } = settings;
        return {
            life: Array.from({ length: playerCount }, (_, player) => life[player] ?? settings.startingLife),
            damage: resizeCommanderDamage(stored.damage, playerCount),
            // Deliberately dropped: a delta is the run of taps still on screen,
            // and the timeout that fades it did not survive the reload. Kept,
            // it would sit next to a total for the rest of the game.
            deltas: {},
            // Dropped for the same reason and one of its own: a hit is only
            // offerable for a couple of seconds, and nothing survives a reload
            // that fast.
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
 */
export function saveLifeTrackerGame(table: Table): void {
    try {
        const stored: StoredGame = { life: table.life, damage: table.damage, at: Date.now() };
        localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(stored));
    } catch {
        // The game still runs out of state; it just will not survive a reload.
    }
}

/**
 * Whether stored totals read as a seated pod.
 *
 * A total itself is not range-checked: it is whatever the table counted it down
 * to, which a game of commander regularly takes below zero.
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
