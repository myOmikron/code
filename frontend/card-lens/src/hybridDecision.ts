//! Shared thresholds and the perceptual-vs-OCR decision, used by both the single-thread
//! reference path (hybridScan, exercised by the regression harness) and the split
//! worker/main-thread app path (scanWorker + scanClient). Keeping the policy here avoids
//! duplicating it across those two call sites.
import type { MatchCandidate } from "./types";

// Above this perceptual similarity we trust the visual match and skip OCR entirely.
export const PERCEPTUAL_CONFIDENT = 0.8;
// Minimum fuzzy name-match confidence to let OCR override the perceptual guess.
export const OCR_NAME_MIN = 0.6;
// Guard: the OCR'd card's best printing must still be visually plausible, so a mis-read that
// happens to name-match something cannot hijack the result.
export const OCR_VISUAL_MIN = 0.5;

export type ScanMethod = "perceptual" | "ocr";

export function isConfident(matches: MatchCandidate[]): boolean {
  return matches.length > 0 && matches[0].similarity >= PERCEPTUAL_CONFIDENT;
}

export type TitleMatch = { matches: MatchCandidate[]; nameScore: number };

/**
 * Choose between the perceptual result and the OCR-by-title result. Trust the name (identity)
 * over ambiguous visuals — the correct card often has LOWER visual similarity here (that is
 * exactly why perceptual failed), so we don't require it to beat perceptual visually, only
 * that it is not implausible.
 */
export function decideMatches(
  perceptual: MatchCandidate[],
  title: TitleMatch,
): { matches: MatchCandidate[]; method: ScanMethod } {
  const ocrTop = title.matches[0];
  if (ocrTop && title.nameScore >= OCR_NAME_MIN && ocrTop.similarity >= OCR_VISUAL_MIN) {
    return { matches: title.matches, method: "ocr" };
  }
  return { matches: perceptual, method: "perceptual" };
}
