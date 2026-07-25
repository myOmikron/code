//! When may the live scanner add the next card?
//!
//! Pure decision logic, kept out of the camera loop so it can be tested. Two *separate* questions
//! hide in here, and conflating them causes very visible misbehaviour in opposite directions:
//!
//!   1. **May we scan again?** Cheap gate that avoids re-running the matcher on a card that is
//!      simply still lying in the guide. Getting this too strict strands the scanner (it waited
//!      for a removal to be *observed*, which was missed whenever the next card settled quickly).
//!   2. **May we add the same card again?** Only a card that genuinely left and came back is a
//!      second copy. Getting this too loose re-adds the card that is still sitting there — hand
//!      movement over an added card is not a new card.
//!
//! Both are answered from sticky observations, so a transient between two samples cannot be lost.

/** Mean absolute luma difference between two guide thumbnails of equal size. */
export function thumbDiff(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || left.length === 0) return Infinity;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return sum / left.length;
}

/** One look at the guide region: is a card there, and what does it look like. */
export type GuideObservation = { present: boolean; luma: Float32Array };

/** What has been seen since the last card was added. */
export type GuideHistory = {
  /** Sticky: the guide showed something other than the added card at some point. */
  sawDifferent: boolean;
  /** Consecutive observations with an empty guide, right now. */
  emptyStreak: number;
  /** Sticky: the guide was *convincingly* empty — the card actually left. */
  sawEmpty: boolean;
};

export const FRESH_GUIDE_HISTORY: GuideHistory = { sawDifferent: false, emptyStreak: 0, sawEmpty: false };

// How many consecutive empty observations prove the card left. One is not enough: a dark card or
// a motion-blurred frame can dip below the presence threshold for a single sample, and treating
// that as "the card left" unlocks re-adding the card that is in fact still lying in the guide —
// which shows up as the same card counted twice.
const EMPTY_STREAK_FOR_REMOVAL = 2;

/** Fold one observation into the history. `changeDiff` is the luma difference above which the
 *  guide counts as showing something other than the card that was added. */
export function observeGuide(
  history: GuideHistory,
  observation: GuideObservation,
  addedThumb: Float32Array | null,
  changeDiff: number,
): GuideHistory {
  const differs = addedThumb === null || thumbDiff(observation.luma, addedThumb) > changeDiff;
  const emptyStreak = observation.present ? 0 : history.emptyStreak + 1;
  return {
    sawDifferent: history.sawDifferent || !observation.present || differs,
    emptyStreak,
    sawEmpty: history.sawEmpty || emptyStreak >= EMPTY_STREAK_FOR_REMOVAL,
  };
}

/** Whether it is worth running the matcher again: the guide no longer shows the added card.
 *  A hand passing over it counts — this only spends a scan, it does not add anything. */
export function mayScanAgain(history: GuideHistory): boolean {
  return history.sawDifferent;
}

/** Whether the *same* card may be added again. Only true once the guide was actually empty, i.e.
 *  the card left and a second copy was put down — proven by consecutive empty observations, not
 *  by a single one. Movement alone must not qualify, and neither may one stray empty frame: the
 *  card that was just added is still lying there, and re-adding it is what the user notices. */
export function mayAddSameCard(history: GuideHistory): boolean {
  return history.sawEmpty;
}
