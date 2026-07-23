/// <reference lib="webworker" />
//! Web Worker for the CPU-heavy, index-bound work: perceptual matching over the full route
//! index and name-based printing lookup. OCR is intentionally NOT here — Tesseract needs
//! importScripts (unavailable in a module worker), so scanClient runs it on the main thread
//! (where Tesseract spawns its own worker, keeping OCR CPU off the main thread anyway).
import { findAllCardMatches, findMatchesByTitle, loadAllCardIndex } from "./allCardIndex";
import type { AllCardIndexSummary } from "./allCardIndex";
import { isConfident } from "./hybridDecision";
import { createScanOverlay, createScanSignatures, createTitleOcrSource } from "./imageHash";
import type { ScanOverlay } from "./imageHash";
import type { ImageSignature, MatchCandidate } from "./types";

type Signatures = { identification: ImageSignature[]; printing: ImageSignature[] };

type IncomingMessage =
  | { type: "load-index"; id: number }
  | { type: "scan"; id: number; blob: Blob }
  | { type: "match-title"; id: number; ocrText: string; signatures: Signatures };

type OutgoingMessage =
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "index-ready"; id: number; summary: AllCardIndexSummary }
  | { type: "scan-frame"; id: number; overlay: ScanOverlay }
  | { type: "scan-analyze"; id: number; done: number; total: number }
  | {
      type: "scanned";
      id: number;
      matches: MatchCandidate[];
      confident: boolean;
      signatures?: Signatures;
      titleBitmap?: ImageBitmap;
      overlay?: ScanOverlay;
    }
  | { type: "title-matches"; id: number; matches: MatchCandidate[]; nameScore: number }
  | { type: "error"; id: number; message: string };

// The DOM lib types `self` as a Window; narrow it to the worker surface we use so
// postMessage/onmessage type-check without the conflicting WebWorker lib.
const worker = self as unknown as {
  postMessage(message: OutgoingMessage, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<IncomingMessage>) => void) | null;
};

worker.onmessage = async (event) => {
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
      const result = await findMatchesByTitle(message.ocrText, message.signatures, 3);
      worker.postMessage({ type: "title-matches", id: message.id, matches: result.matches, nameScore: result.nameScore });
      return;
    }

    // "scan": decode (EXIF-aware) and run perceptual matching, then ALWAYS hand the main
    // thread the normalized title image + signatures so it can run OCR. OCR runs on every scan
    // now — a strong title read can override even a confident-but-wrong perceptual match
    // (dark/low-detail art fools perceptual). OCR's own worker keeps its CPU off the main thread.
    const bitmap = await createImageBitmap(message.blob, { imageOrientation: "from-image" });
    try {
      // Detect the card frame FIRST (cheap) and hand it to the UI immediately, so the frame is
      // drawn around the card while the heavier image analysis + OCR still run — a live pipeline:
      // frame → image analysis → OCR.
      const overlay = createScanOverlay(bitmap);
      worker.postMessage({ type: "scan-frame", id: message.id, overlay });

      const signatures = createScanSignatures(bitmap);
      const matches = await findAllCardMatches(
        signatures.identification,
        3,
        (done, total) => worker.postMessage({ type: "scan-analyze", id: message.id, done, total }),
        signatures.printing,
      );
      const titleSource = createTitleOcrSource(bitmap) as OffscreenCanvas;
      const titleBitmap = titleSource.transferToImageBitmap();
      worker.postMessage(
        { type: "scanned", id: message.id, matches, confident: isConfident(matches), signatures, titleBitmap, overlay },
        [titleBitmap],
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
