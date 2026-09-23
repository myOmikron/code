//! Decides whether a detected card is fit to recognise, before the expensive half runs.
import type { CardQuad } from "./card-detect";
import type { FrameQuality } from "./image-quality";

/** What keeps a frame from being recognised, in the order worth fixing. */
export type Shortcoming = "closer" | "tilted" | "glare" | "dark" | "moving" | "blurred";

/** Limits a frame must clear; measured with `pnpm run scan:quality`. */
export const QUALITY_LIMITS = {
    /** Share of the guide region the card must cover */
    minArea: 0.3,
    minSymmetry: 0.7,
    minAspect: 0.7,
    /** Movement per frame, as a share of card height */
    maxMotion: 0.012,
    /** Absolute sharpness floor; the real check is relative to the recent peak */
    minSharpness: 40,
    /** Share of the recent sharpness peak a frame must reach */
    relativeSharpness: 0.6,
    /** Share of pixels allowed at full white */
    maxClipped: 0.06,
    /** Mean luminance floor, 0–255 */
    minMean: 45,
};

/**
 * Lists what is wrong with a frame, worst first; empty when it is fit to recognise.
 *
 * @param quality
 * @param peak the sharpest this card recently measured, 0 on first sight
 * @param limits
 * @returns
 */
export function shortcomingsOf(quality: FrameQuality, peak = 0, limits = QUALITY_LIMITS): Shortcoming[] {
    const found: Shortcoming[] = [];
    if (quality.areaFraction < limits.minArea) found.push("closer");
    if (quality.symmetry < limits.minSymmetry || quality.aspect < limits.minAspect) found.push("tilted");
    if (quality.exposure.clipped > limits.maxClipped) found.push("glare");
    if (quality.exposure.mean < limits.minMean) found.push("dark");
    // Unknown motion (first sight) is not movement. Motion before blur: holding still fixes both.
    if (Number.isFinite(quality.motion) && quality.motion > limits.maxMotion) found.push("moving");
    else if (quality.sharpness < Math.max(limits.minSharpness, peak * limits.relativeSharpness)) found.push("blurred");
    return found;
}

/** Tuning for {@link createFrameGate}. */
export const FRAME_GATE_OPTIONS = {
    /** Frames without a card before it counts as gone */
    absentFrames: 2,
    /** Movement per frame that means a different card */
    newPresentationMotion: 0.25,
    /** How much of the sharpness peak survives each frame */
    peakDecay: 0.85,
};

/**
 * Judges frames one at a time, tracking the current card's sharpness peak and last position.
 *
 * @param options
 * @returns the gate
 */
export function createFrameGate(options = FRAME_GATE_OPTIONS) {
    let absent = 0;
    let peak = 0;
    let seen = false;
    let quad: CardQuad | null = null;

    return {
        /** @returns where the card was last seen */
        get previousQuad() {
            return quad;
        },
        /**
         * Judges one frame's detected card.
         *
         * @param quality
         * @param found where the card was found
         * @returns shortcomings, worst first
         */
        observe(quality: FrameQuality, found: CardQuad): Shortcoming[] {
            absent = 0;
            // A big jump is a new card. Unknown motion, as after a detection blink, is not.
            const jumped = Number.isFinite(quality.motion) && quality.motion > options.newPresentationMotion;
            if (!seen || jumped) peak = 0;
            seen = true;
            quad = found;
            const shortcomings = shortcomingsOf(quality, peak);
            peak = Math.max(quality.sharpness, peak * options.peakDecay);
            return shortcomings;
        },
        /** Records a frame without a card; a single miss is a detection blink, not the card leaving. */
        missed() {
            quad = null;
            absent += 1;
            if (absent >= options.absentFrames) {
                seen = false;
                peak = 0;
            }
        },
        /** Forgets everything. */
        reset() {
            absent = 0;
            peak = 0;
            seen = false;
            quad = null;
        },
    };
}
