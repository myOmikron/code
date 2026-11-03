import type { Diagnostics } from "src/api/graph-generated";
import {
    Corridor,
    DeckTargets,
    curveCounts,
    withCorridor,
    withCurve,
    withTypeCorridor,
    withoutCorridor,
    withoutTypeCorridor,
} from "src/utils/deck-targets";

/** How a fix moves the deck's targets, in cards: + raises a range, − lowers it (the price) */
export type Shift = {
    buckets?: Record<string, number>;
    types?: Record<string, number>;
    /** Mana value to cards */
    curve?: Record<number, number>;
};

/** One way to answer a problem */
export type Fix = { id: string; shift: Shift };

/** Something that went wrong in games, and the ways to answer it */
export type Problem = { id: string; fixes: Array<Fix> };

/** A direction the reader chose: a problem and the fix they picked for it */
export type Direction = { problem: string; fix: string };

/** How many problems one debrief may answer: each fix has a price, and three prices mostly cancel */
export const MAX_PROBLEMS = 2;

const MORE_RAMP: Fix = { id: "ramp", shift: { buckets: { ramp: 2, synergy_wincon: -2 } } };
const LOWER_CURVE: Fix = { id: "curve", shift: { curve: { 2: 2, 5: -1, 6: -1 } } };

/** Every problem the debrief asks about, in the order it lists them */
export const PROBLEMS: ReadonlyArray<Problem> = [
    {
        id: "screw",
        fixes: [
            { id: "lands", shift: { types: { Land: 2 }, buckets: { synergy_wincon: -2 } } },
            MORE_RAMP,
            LOWER_CURVE,
        ],
    },
    {
        id: "flood",
        fixes: [
            { id: "fewer-lands", shift: { types: { Land: -2 }, buckets: { synergy_wincon: 2 } } },
            { id: "draw", shift: { buckets: { card_draw: 2, synergy_wincon: -2 } } },
        ],
    },
    {
        id: "cards",
        fixes: [
            { id: "draw", shift: { buckets: { card_draw: 3, synergy_wincon: -2 } } },
            { id: "draw-over-ramp", shift: { buckets: { card_draw: 2, ramp: -2 } } },
        ],
    },
    {
        id: "interaction",
        fixes: [
            { id: "removal", shift: { buckets: { interaction: 3, synergy_wincon: -2 } } },
            { id: "instant-speed", shift: { types: { Instant: 3, Sorcery: -2 }, buckets: { interaction: 1 } } },
        ],
    },
    { id: "slow", fixes: [MORE_RAMP, LOWER_CURVE] },
    {
        id: "close",
        fixes: [
            { id: "finishers", shift: { buckets: { synergy_wincon: 3, card_draw: -2 } } },
            { id: "threats", shift: { buckets: { synergy_wincon: 2, interaction: -2 } } },
        ],
    },
];

/**
 * The fix a stored direction names
 *
 * @param direction the stored direction
 *
 * @returns the fix, or `undefined` for one this release no longer offers
 */
export function fixOf(direction: Direction): Fix | undefined {
    return PROBLEMS.find((p) => p.id === direction.problem)?.fixes.find((f) => f.id === direction.fix);
}

/** Within this of the default, a moved range is the default again and the override goes */
const SAME = 0.05;

/**
 * Moves one range, dropping the override once it lands back on the default
 *
 * @param current the range in force
 * @param by how far to move it
 * @param fallback the service's default range
 *
 * @returns the moved range, or `null` when it is the default
 */
function moved(current: Corridor, by: number, fallback: Corridor): Corridor | null {
    const low = Math.max(0, current.low + by);
    const high = Math.max(low, current.high + by);
    return Math.abs(low - fallback.low) < SAME && Math.abs(high - fallback.high) < SAME ? null : { low, high };
}

/**
 * Applies a fix to the deck's targets, or takes it back out
 *
 * Read against the ranges the analysis reports in force, so a fix lands on
 * whatever the reader had already moved by hand.
 *
 * @param targets the targets in force
 * @param report the analysis the targets were read against
 * @param shift the fix's shift
 * @param sign 1 to apply, -1 to take back
 *
 * @returns the new targets
 */
export function shiftTargets(targets: DeckTargets, report: Diagnostics, shift: Shift, sign: 1 | -1): DeckTargets {
    let next = targets;
    for (const [bucket, by] of Object.entries(shift.buckets ?? {})) {
        const row = report.buckets.find((entry) => entry.bucket === bucket);
        if (row === undefined) continue;
        const current = next.buckets[bucket] ?? { low: row.low, high: row.high };
        const corridor = moved(current, by * sign, {
            low: row.default_low ?? row.low,
            high: row.default_high ?? row.high,
        });
        next = corridor === null ? withoutCorridor(next, bucket) : withCorridor(next, bucket, corridor);
    }
    for (const [type, by] of Object.entries(shift.types ?? {})) {
        const row = (report.types ?? []).find((entry) => entry.type === type);
        if (row === undefined) continue;
        const current = next.types[type] ?? { low: row.low, high: row.high };
        const corridor = moved(current, by * sign, {
            low: row.default_low ?? row.low,
            high: row.default_high ?? row.high,
        });
        next = corridor === null ? withoutTypeCorridor(next, type) : withTypeCorridor(next, type, corridor);
    }
    if (shift.curve !== undefined) {
        const spells = Math.max(0, report.deck_size - report.lands);
        const counts = curveCounts(next, spells) ?? report.curve.map((column) => column.target);
        const shifted = counts.map((count, mv) => Math.max(0, count + (shift.curve?.[mv] ?? 0) * sign));
        next = withCurve(next, shifted);
    }
    return next;
}
