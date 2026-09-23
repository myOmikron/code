//! Suggests more light or a lighter surface when no card has been found for a while.
import { QUALITY_LIMITS } from "./frame-gate";

/** What the tip suggests. */
export type SearchTip = "more-light" | "lighter-surface";

/** Milliseconds without a card before the tip appears. */
export const TIP_AFTER = 4000;

/**
 * Mean luminance of an RGBA sample, 0–255.
 *
 * @param sample
 * @returns
 */
export function luminanceOf(sample: Uint8ClampedArray): number {
    let sum = 0;
    for (let at = 0; at < sample.length; at += 4) {
        sum += (sample[at] * 299 + sample[at + 1] * 587 + sample[at + 2] * 114) / 1000;
    }
    return sample.length === 0 ? 0 : sum / (sample.length / 4);
}

/**
 * The tip to show, or null while it is too early for one.
 *
 * @param sample the latest tiny camera sample
 * @param lastCardAt when a card was last found
 * @param now
 * @returns
 */
export function searchTip(sample: Uint8ClampedArray | null, lastCardAt: number, now: number): SearchTip | null {
    if (now - lastCardAt < TIP_AFTER) return null;
    return sample && luminanceOf(sample) < QUALITY_LIMITS.minMean ? "more-light" : "lighter-surface";
}
