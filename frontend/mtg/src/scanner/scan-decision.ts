//! Turns verified candidates into an answer, or into an honest refusal.
//!
//! A scanner that always names a card is worse than one that sometimes says nothing: a wrong
//! card enters the collection silently and is found weeks later, while "not recognised" costs
//! one more second of holding the card still. The inlier count separates the two cases so
//! cleanly that the choice barely costs anything.
//!
//! Measured over 113 photos across three backgrounds: every correct answer had at least 30
//! inliers, every wrong one at most 14, and the range between was empty. The mechanism behind
//! that gap is not a coincidence of this data, it is what the count means. Two pictures of the
//! same card agree in hundreds of places at once and all of those agreements fit one homography;
//! two different cards agree in a handful of places that fit nothing.
import type { IndexMatch } from "./embedding-index";

/**
 * A candidate after local-feature verification
 */
export type VerifiedCandidate = {
    match: IndexMatch;
    /** Correspondences consistent with a single homography */
    inliers: number;
};

/**
 * What a scan concluded
 */
export type ScanOutcome =
    | {
          status: "recognised";
          printing: IndexMatch["printing"];
          inliers: number;
          /** Runner-up's inliers, for callers that want to show how clear the call was */
          runnerUp: number;
      }
    | {
          status: "unrecognised";
          /** `no-card` when detection found nothing, `weak-match` when nothing matched well */
          reason: "no-card" | "weak-match";
          bestInliers: number;
      };

/**
 * Fewest inliers an answer needs before it is offered at all.
 *
 * Sits in the middle of the measured gap between 14 and 30, so neither bound is being crowded.
 * Raising it starts discarding correct answers, lowering it starts admitting wrong ones; both
 * only begin outside that range.
 */
export const MIN_ACCEPT_INLIERS = 22;

/**
 * Decides what a scan should report.
 *
 * @param candidates every candidate that was verified, in any order
 * @returns the answer, or why there is none
 */
export function decideScan(candidates: VerifiedCandidate[]): ScanOutcome {
    if (candidates.length === 0) return { status: "unrecognised", reason: "no-card", bestInliers: 0 };

    const ranked = [...candidates].sort((first, second) => second.inliers - first.inliers);
    const best = ranked[0];
    if (best.inliers < MIN_ACCEPT_INLIERS) {
        return { status: "unrecognised", reason: "weak-match", bestInliers: best.inliers };
    }
    return {
        status: "recognised",
        printing: best.match.printing,
        inliers: best.inliers,
        runnerUp: ranked[1]?.inliers ?? 0,
    };
}
