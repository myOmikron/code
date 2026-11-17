import type { RejectReason } from "src/api/generated";

/** How far a card travels before letting go counts as a swipe, in px */
export const SWIPE_DISTANCE = 110;

/** How much a flick's speed adds to the distance, in seconds */
const FLICK_WEIGHT = 0.2;

/** Ask for more Commanders once this few are left */
export const REFILL_AT = 3;

/** How many variants each line has in the locale files */
export const LINE_VARIANTS = 3;

/** The colors a Commander can have */
export const COLORS = ["W", "U", "B", "R", "G"] as const;

/** One of {@link COLORS} */
export type Color = (typeof COLORS)[number];

/** Which way a card left */
export type SwipeDirection = "left" | "right" | "up";

/** A point or speed on screen */
export type Vector = {
    /** Horizontal */
    x: number;
    /** Vertical, down is positive */
    y: number;
};

/**
 * Reads a released drag as a swipe.
 *
 * @param offset how far the card was dragged
 * @param velocity how fast it moved when let go, in px/s
 * @returns the swipe, or `null` to snap back
 */
export function swipeDirection(offset: Vector, velocity: Vector): SwipeDirection | null {
    const x = offset.x + velocity.x * FLICK_WEIGHT;
    const y = offset.y + velocity.y * FLICK_WEIGHT;
    if (-y > SWIPE_DISTANCE && -y > Math.abs(x)) return "up";
    if (Math.abs(x) > SWIPE_DISTANCE) return x > 0 ? "right" : "left";
    return null;
}

/**
 * Picks a line variant that stays the same for the same Commander.
 *
 * @param seed what the line is about, usually the Commander's oracle id
 * @returns a variant from 1 to {@link LINE_VARIANTS}
 */
export function lineVariant(seed: string): number {
    let hash = 0;
    for (const char of seed) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return (hash % LINE_VARIANTS) + 1;
}

/**
 * The locale key of a rejection's line.
 *
 * @param reason why the Commander said no
 * @param seed the Commander's oracle id
 * @returns a `description.reject-…` key of the dating namespace
 */
export function rejectionKey(reason: RejectReason, seed: string): string {
    const direction = reason.direction ? `-${reason.direction.toLowerCase()}` : "";
    return `description.reject-${reason.dimension.toLowerCase()}${direction}-${lineVariant(seed)}`;
}

/**
 * The locale key of a match's line.
 *
 * @param seed the Commander's oracle id
 * @returns a `description.match-…` key of the dating namespace
 */
export function matchKey(seed: string): string {
    return `description.match-${lineVariant(seed)}`;
}

/**
 * Turns missing color letters into a mana cost the app can draw.
 *
 * @param letters color letters, e.g. `"RB"`
 * @returns e.g. `"{R}{B}"`
 */
export function manaSymbols(letters: string): string {
    return [...letters].map((letter) => `{${letter}}`).join("");
}

/**
 * The colors to send with a stack request.
 *
 * @param selected the filter's colors
 * @returns letters in WUBRG order, or `null` for no filter
 */
export function colorFilter(selected: ReadonlySet<Color>): string | null {
    if (selected.size === 0 || selected.size === COLORS.length) return null;
    return COLORS.filter((color) => selected.has(color)).join("");
}
