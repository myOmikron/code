//! Shared thresholds and the perceptual-vs-OCR decision, used by both the single-thread
//! reference path (hybridScan, exercised by the regression harness) and the split
//! worker/main-thread app path (scanWorker + scanClient). Keeping the policy here avoids
//! duplicating it across those two call sites.
import type { MatchCandidate } from "./types";

// Perceptual similarity considered "confident" (informational flag only — OCR now always runs).
export const PERCEPTUAL_CONFIDENT = 0.8;
// A near-exact name read (essentially the exact title) is trusted outright, skipping the
// visual-plausibility guard — the card art can legitimately be dark/low-detail (Nazgûl).
export const OCR_NAME_TRUST = 0.95;
// Minimum fuzzy name-match confidence to let OCR override the perceptual guess. Set high:
// OCR must only override when the title reads *cleanly*. A garbled read still fuzzy-matches
// some card at a mediocre score (e.g. "pr br ary" → "Library" ≈ 0.80) and must NOT hijack a
// correct-but-not-confident perceptual result; clean reads score ~0.88+.
export const OCR_NAME_MIN = 0.85;
// Guard: the OCR'd card's best printing must still be visually plausible, so a mis-read that
// happens to name-match something cannot hijack the result.
export const OCR_VISUAL_MIN = 0.5;

export type ScanMethod = "perceptual" | "ocr";

export function isConfident(matches: MatchCandidate[]): boolean {
  return matches.length > 0 && matches[0].similarity >= PERCEPTUAL_CONFIDENT;
}

export type TitleMatch = { matches: MatchCandidate[]; nameScore: number };

/**
 * Choose between the perceptual result and the OCR-by-title result. The card name (a clean
 * OCR read) is a more reliable identity signal than the artwork signatures — which can be
 * confidently WRONG on dark/low-detail cards (a Nazgûl matches an unrelated dark card at
 * >0.8). So a strong name read overrides perceptual even when perceptual looked "confident",
 * but only when the two DISAGREE on the card: if they agree, we keep the perceptual result
 * because its printing rank is at least as good (and correct-but-unconfident printings should
 * not be re-shuffled by OCR).
 */
export function decideMatches(
  perceptual: MatchCandidate[],
  title: TitleMatch,
): { matches: MatchCandidate[]; method: ScanMethod } {
  const ocrTop = title.matches[0];
  if (!ocrTop || title.nameScore < OCR_NAME_MIN) return { matches: perceptual, method: "perceptual" };

  // Near-exact reads are trusted outright; moderate reads must be visually plausible so a
  // mis-read that name-matches something cannot hijack the result.
  const trusted = title.nameScore >= OCR_NAME_TRUST || ocrTop.similarity >= OCR_VISUAL_MIN;
  if (!trusted) return { matches: perceptual, method: "perceptual" };

  const perceptualTop = perceptual[0];
  if (perceptualTop && perceptualTop.card.name === ocrTop.card.name) {
    return { matches: perceptual, method: "perceptual" };
  }
  return { matches: title.matches, method: "ocr" };
}
