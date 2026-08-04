/// <reference lib="webworker" />
//! Web Worker for the CPU-heavy, index-bound work: perceptual matching over the full route
//! index and name-based printing lookup. OCR is intentionally NOT here — Tesseract needs
//! importScripts (unavailable in a module worker), so scanClient runs it on the main thread
//! (where Tesseract spawns its own worker, keeping OCR CPU off the main thread anyway).
import { findAllCardMatches, findMatchesByTitle, lastMatchProfile, listPrintingsByName, loadAllCardIndex, resolveSetFilter } from "./allCardIndex";
import type { AllCardIndexSummary } from "./allCardIndex";
import { isConfident } from "./hybridDecision";
import { createFullArtNameOcrSource, createScanOverlay, createScanSignatures, createTitleOcrSource } from "./imageHash";
import type { ScanOverlay } from "./imageHash";
import type { CardRecord, ImageSignature, MatchCandidate } from "./types";

type Signatures = { identification: ImageSignature[]; printing: ImageSignature[] };

/** Per-stage timings (ms) of one fast scan, surfaced for the live-scan benchmark. */
export type ScanProfile = {
  decode: number;
  signatures: number;
  variants: number;
  routeSelect: number;
  load: number;
  fineRank: number;
  rank: number;
  candidates: number;
  printingScored: number;
  /** Wall time inside the worker, from message receipt to the reply being posted. */
  workerWall: number;
};

type IncomingMessage =
  | { type: "load-index"; id: number }
  | { type: "scan"; id: number; blob: Blob; fast?: boolean; setCodes?: string[] | null }
  | { type: "match-title"; id: number; ocrText: string; signatures: Signatures; setCodes?: string[] | null }
  | { type: "list-printings"; id: number; name: string };

type OutgoingMessage =
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "index-ready"; id: number; summary: AllCardIndexSummary }
  | { type: "scan-frame"; id: number; overlay: ScanOverlay }
  | { type: "scan-analyze"; id: number; done: number; total: number }
  | { type: "title-ready"; id: number; titleBitmap: ImageBitmap; fullArtNameBitmap: ImageBitmap }
  | {
      type: "scanned";
      id: number;
      matches: MatchCandidate[];
      confident: boolean;
      profile?: ScanProfile;
      signatures?: Signatures;
      overlay?: ScanOverlay;
    }
  | { type: "title-matches"; id: number; matches: MatchCandidate[]; nameScore: number }
  | { type: "printings"; id: number; printings: CardRecord[] }
  | { type: "error"; id: number; message: string };

// The DOM lib types `self` as a Window; narrow it to the worker surface we use so
// postMessage/onmessage type-check without the conflicting WebWorker lib.
const worker = self as unknown as {
  postMessage(message: OutgoingMessage, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<IncomingMessage>) => void) | null;
};

worker.onmessage = async (event) => {
  const receivedAt = performance.now();
  const message = event.data;
  try {
    if (message.type === "load-index") {
      const summary = await loadAllCardIndex((done, total) =>
        worker.postMessage({ type: "progress", id: message.id, done, total }),
      );
      worker.postMessage({ type: "index-ready", id: message.id, summary });
      return;
    }

    if (message.type === "match-title") {
      const result = await findMatchesByTitle(message.ocrText, message.signatures, 3, await resolveSetFilter(message.setCodes));
      worker.postMessage({ type: "title-matches", id: message.id, matches: result.matches, nameScore: result.nameScore });
      return;
    }

    if (message.type === "list-printings") {
      // Unfiltered by the scan scope on purpose: a correction is the user overruling the
      // scanner, so the set they narrowed to must not also narrow what they may correct to.
      worker.postMessage({ type: "printings", id: message.id, printings: await listPrintingsByName(message.name) });
      return;
    }

    // "scan": decode (EXIF-aware) and run perceptual matching, then ALWAYS hand the main
    // thread the normalized title image + signatures so it can run OCR. OCR runs on every scan
    // now — a strong title read can override even a confident-but-wrong perceptual match
    // (dark/low-detail art fools perceptual). OCR's own worker keeps its CPU off the main thread.
    // Restricting the search to the sets the user picked is both a precision and a speed win:
    // routes outside them are never scored at all.
    const allowedSets = await resolveSetFilter(message.setCodes);
    const decodeStart = performance.now();
    const bitmap = await createImageBitmap(message.blob, { imageOrientation: "from-image" });
    const decodeMs = performance.now() - decodeStart;
    try {
      // Fast path for live multi-card scanning: perceptual match only, no overlay/OCR-source work
      // (full fine-ranking shortlist for accuracy — precision matters more than the last few ms).
      if (message.fast) {
        const signatureStart = performance.now();
        const signatures = createScanSignatures(bitmap);
        const signatureMs = performance.now() - signatureStart;
        const matches = await findAllCardMatches(signatures.identification, 3, undefined, signatures.printing, undefined, allowedSets);
        worker.postMessage({
          type: "scanned",
          id: message.id,
          matches,
          confident: isConfident(matches),
          profile: {
            decode: decodeMs,
            signatures: signatureMs,
            variants: signatures.identification.length,
            routeSelect: lastMatchProfile.routeSelect,
            load: lastMatchProfile.load,
            fineRank: lastMatchProfile.fineRank,
            rank: lastMatchProfile.rank,
            candidates: lastMatchProfile.candidates,
            printingScored: lastMatchProfile.printingScored,
            workerWall: performance.now() - receivedAt,
          },
        });
        return;
      }
      // Cut the OCR title crop FIRST and hand it over immediately, so the main thread can start
      // Tesseract while this worker is still fine-ranking. Perceptual matching and OCR are
      // independent identity signals; running them concurrently makes a hybrid scan cost about
      // max(perceptual, OCR) instead of their sum.
      const titleBitmap = (createTitleOcrSource(bitmap) as OffscreenCanvas).transferToImageBitmap();
      // Also the lower name banner, for full-art cards that carry no title at the top. It is only
      // OCR'd when the top strip yields no name (see scanClient.readTitle), but cutting it here
      // costs one crop and saves a second round trip to the worker when it is needed.
      const fullArtNameBitmap = (createFullArtNameOcrSource(bitmap) as OffscreenCanvas).transferToImageBitmap();
      worker.postMessage(
        { type: "title-ready", id: message.id, titleBitmap, fullArtNameBitmap },
        [titleBitmap, fullArtNameBitmap],
      );

      // Then the card frame for the UI overlay, so it is drawn around the card while the heavier
      // image analysis still runs — a live pipeline: title → frame → image analysis.
      const overlay = createScanOverlay(bitmap);
      worker.postMessage({ type: "scan-frame", id: message.id, overlay });

      const signatures = createScanSignatures(bitmap);
      const matches = await findAllCardMatches(
        signatures.identification,
        3,
        (done, total) => worker.postMessage({ type: "scan-analyze", id: message.id, done, total }),
        signatures.printing,
        undefined,
        allowedSets,
      );
      worker.postMessage(
        { type: "scanned", id: message.id, matches, confident: isConfident(matches), signatures, overlay },
        );
    } finally {
      bitmap.close();
    }
  } catch (error) {
    worker.postMessage({
      type: "error",
      id: message.id,
      message: error instanceof Error ? error.message : "Die Karte konnte nicht analysiert werden.",
    });
  }
};
