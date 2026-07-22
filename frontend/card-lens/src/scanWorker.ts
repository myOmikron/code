/// <reference lib="webworker" />
//! Web Worker for the CPU-heavy, index-bound work: perceptual matching over the full route
//! index and name-based printing lookup. OCR is intentionally NOT here — Tesseract needs
//! importScripts (unavailable in a module worker), so scanClient runs it on the main thread
//! (where Tesseract spawns its own worker, keeping OCR CPU off the main thread anyway).
import { findAllCardMatches, findMatchesByTitle, loadAllCardIndex } from "./allCardIndex";
import type { AllCardIndexSummary } from "./allCardIndex";
import { isConfident } from "./hybridDecision";
import { createScanSignatures, createTitleOcrSource } from "./imageHash";
import type { ImageSignature, MatchCandidate } from "./types";

type Signatures = { identification: ImageSignature[]; printing: ImageSignature[] };

type IncomingMessage =
  | { type: "load-index"; id: number }
  | { type: "scan"; id: number; blob: Blob }
  | { type: "match-title"; id: number; ocrText: string; signatures: Signatures };

type OutgoingMessage =
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "index-ready"; id: number; summary: AllCardIndexSummary }
  | {
      type: "scanned";
      id: number;
      matches: MatchCandidate[];
      confident: boolean;
      signatures?: Signatures;
      titleBitmap?: ImageBitmap;
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

    // "scan": decode (EXIF-aware) and run perceptual matching. When confident we are done;
    // otherwise hand the main thread the normalized title image + signatures for the OCR path.
    const bitmap = await createImageBitmap(message.blob, { imageOrientation: "from-image" });
    try {
      const signatures = createScanSignatures(bitmap);
      const matches = await findAllCardMatches(signatures.identification, 3, undefined, signatures.printing);
      if (isConfident(matches)) {
        worker.postMessage({ type: "scanned", id: message.id, matches, confident: true });
        return;
      }
      const titleSource = createTitleOcrSource(bitmap) as OffscreenCanvas;
      const titleBitmap = titleSource.transferToImageBitmap();
      worker.postMessage(
        { type: "scanned", id: message.id, matches, confident: false, signatures, titleBitmap },
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
