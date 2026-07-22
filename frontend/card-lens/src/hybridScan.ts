//! Single-thread reference implementation of the hybrid scan (perceptual first, OCR-of-title
//! fallback). Used by the regression harness, which runs on a page's main thread where
//! Tesseract works directly. The app itself uses the split worker/main-thread path
//! (scanWorker + scanClient) but shares the same policy via hybridDecision.
import { findAllCardMatches, findMatchesByTitle } from "./allCardIndex";
import { decideMatches, isConfident, type ScanMethod } from "./hybridDecision";
import { createScanSignatures, createTitleOcrSource } from "./imageHash";
import { recognizeCardTitle } from "./titleOcr";
import type { MatchCandidate } from "./types";

export type HybridResult = { matches: MatchCandidate[]; method: ScanMethod; ocrText?: string };

export async function hybridScan(source: CanvasImageSource, limit = 3): Promise<HybridResult> {
  const signatures = createScanSignatures(source);
  const perceptual = await findAllCardMatches(signatures.identification, limit, undefined, signatures.printing);
  if (isConfident(perceptual)) return { matches: perceptual, method: "perceptual" };

  try {
    const ocrText = await recognizeCardTitle(createTitleOcrSource(source));
    const title = await findMatchesByTitle(ocrText, signatures, limit);
    return { ...decideMatches(perceptual, title), ocrText };
  } catch {
    // OCR is best-effort; any failure falls back to the perceptual result.
    return { matches: perceptual, method: "perceptual" };
  }
}
