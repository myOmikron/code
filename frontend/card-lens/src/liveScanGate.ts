//! When has the card in the live guide been replaced by a new one?
//!
//! Pure decision logic, kept out of the camera loop so it can be tested: the loop only supplies
//! observations. Getting this wrong is very visible to the user — the previous version waited for
//! a *removal* to be observed and counted consecutive empty-or-moving frames, but the counter
//! reset on every steady frame. Lifting a card off a stack and settling on the next one therefore
//! reset it before it completed, and the scanner stayed stuck until the camera was pointed away.

/** Mean absolute luma difference between two guide thumbnails of equal size. */
export function thumbDiff(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || left.length === 0) return Infinity;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return sum / left.length;
}

/** One look at the guide region: is a card there, how much is it moving, what does it look like. */
export type GuideObservation = { present: boolean; motion: number; luma: Float32Array };

export type ReplacementOptions = {
  /** Frame-to-frame difference above which the guide counts as disturbed (a swap in progress). */
  motionThreshold: number;
  /** Difference from the added card above which the guide counts as showing a different card. */
  changeDiff: number;
};

/**
 * Decide whether the guide has moved on from the card that was just added.
 *
 * `disturbed` is **sticky**: once movement or an empty guide has been seen since the add it stays
 * set, so a brief lift between two samples cannot be missed. That is what lets a second, identical
 * copy of the same card through — comparing the pictures alone cannot tell two copies apart.
 *
 * Returns the next `disturbed` state along with the verdict, so the caller holds no logic itself.
 */
export function observeReplacement(
  observation: GuideObservation,
  addedThumb: Float32Array | null,
  disturbed: boolean,
  options: ReplacementOptions,
): { disturbed: boolean; replaced: boolean } {
  const nextDisturbed = disturbed || !observation.present || observation.motion > options.motionThreshold;
  const looksDifferent = addedThumb !== null && thumbDiff(observation.luma, addedThumb) > options.changeDiff;
  return {
    disturbed: nextDisturbed,
    replaced: !observation.present || nextDisturbed || looksDifferent,
  };
}
