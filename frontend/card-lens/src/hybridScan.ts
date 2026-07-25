//! Single-thread reference implementation of the hybrid scan (perceptual first, OCR-of-title
//! fallback). Used by the regression harness, which runs on a page's main thread where
//! Tesseract works directly. The app itself uses the split worker/main-thread path
//! (scanWorker + scanClient) but shares the same policy via hybridDecision.
import { findAllCardMatches, findMatchesByTitle } from "./allCardIndex";
import { decideMatches, OCR_NAME_MIN, OCR_NAME_TRUST, type ScanMethod } from "./hybridDecision";
import { createFullArtNameOcrSource, createScanSignatures, createTitleOcrSource } from "./imageHash";
import { matchBasicLandName, matchCardName } from "./nameIndex";
import { recognizeCardTitle } from "./titleOcr";
import type { MatchCandidate } from "./types";

export type HybridResult = { matches: MatchCandidate[]; method: ScanMethod; ocrText?: string };

/** Mirror of `scanClient.readTitle` + its banner rule: title bar first; if that yields no name,
 *  the lower name banner is read but only accepted when perceptual matching independently agrees
 *  the card is that basic land (the region also holds rules text, which names land types). Kept
 *  in lockstep so the regression harness exercises the policy the app runs. */
async function readTitle(source: CanvasImageSource, perceptualName: string): Promise<string> {
  const { text } = await recognizeCardTitle(createTitleOcrSource(source), {
    isConclusive: async (candidate) => {
      const match = await matchCardName(candidate);
      return Boolean(match && match.score >= OCR_NAME_TRUST);
    },
  });
  const topMatch = await matchCardName(text);
  if (topMatch && topMatch.score >= OCR_NAME_MIN) return text;

  const banner = await recognizeCardTitle(createFullArtNameOcrSource(source), { bandSearchFraction: 1 });
  const land = await matchBasicLandName(banner.text);
  return land && land.name === perceptualName.toLowerCase() ? land.name : text;
}

export async function hybridScan(source: CanvasImageSource, limit = 3): Promise<HybridResult> {
  const signatures = createScanSignatures(source);
  const perceptual = await findAllCardMatches(signatures.identification, limit, undefined, signatures.printing);

  // OCR always runs: a strong title read can override even a confident-but-wrong perceptual
  // match (see decideMatches). OCR failure falls back to the perceptual result.
  try {
    const ocrText = await readTitle(source, perceptual[0]?.card.name ?? "");
    const title = await findMatchesByTitle(ocrText, signatures, limit);
    return { ...decideMatches(perceptual, title), ocrText };
  } catch {
    return { matches: perceptual, method: "perceptual" };
  }
}
