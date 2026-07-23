//! Main-thread client for the scan worker. Orchestrates the hybrid flow: the worker does the
//! heavy perceptual matching and index lookups; if that is not confident, the client runs
//! title OCR here on the main thread (Tesseract spawns its own worker, so the OCR CPU stays
//! off the main thread) and asks the worker to resolve the printing from the recognized name.
import type { AllCardIndexSummary } from "./allCardIndex";
import { decideMatches } from "./hybridDecision";
import type { ScanOverlay } from "./imageHash";
import { recognizeCardTitle } from "./titleOcr";
import type { ImageSignature, MatchCandidate } from "./types";

export type { ScanOverlay, CardQuad } from "./imageHash";

type ProgressListener = (done: number, total: number) => void;
type Signatures = { identification: ImageSignature[]; printing: ImageSignature[] };

type ScannedMessage = {
  type: "scanned";
  id: number;
  matches: MatchCandidate[];
  confident: boolean;
  signatures?: Signatures;
  titleBitmap?: ImageBitmap;
  overlay?: ScanOverlay;
};
type TitleMatchesMessage = { type: "title-matches"; id: number; matches: MatchCandidate[]; nameScore: number };
type FrameMessage = { type: "scan-frame"; id: number; overlay: ScanOverlay };
type AnalyzeMessage = { type: "scan-analyze"; id: number; done: number; total: number };
type StageMessage = FrameMessage | AnalyzeMessage;

type IncomingMessage =
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "index-ready"; id: number; summary: AllCardIndexSummary }
  | StageMessage
  | ScannedMessage
  | TitleMatchesMessage
  | { type: "error"; id: number; message: string };

type ResolveValue = AllCardIndexSummary | ScannedMessage | TitleMatchesMessage;
type PendingRequest = {
  resolve: (value: ResolveValue) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressListener;
  onStage?: (message: StageMessage) => void;
};

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./scanWorker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<IncomingMessage>) => {
    const message = event.data;
    const request = pending.get(message.id);
    if (!request) return;
    switch (message.type) {
      case "progress":
        request.onProgress?.(message.done, message.total);
        break;
      case "scan-frame":
      case "scan-analyze":
        request.onStage?.(message);
        break;
      case "index-ready":
        pending.delete(message.id);
        request.resolve(message.summary);
        break;
      case "scanned":
      case "title-matches":
        pending.delete(message.id);
        request.resolve(message);
        break;
      case "error":
        pending.delete(message.id);
        request.reject(new Error(message.message));
        break;
    }
  };
  created.onerror = (event) => {
    const error = new Error(event.message || "Der Scan-Worker ist abgestürzt.");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker = null; // let the next call spawn a fresh worker
  };
  worker = created;
  return created;
}

function request<T extends ResolveValue>(
  message: Record<string, unknown>,
  onProgress?: ProgressListener,
  onStage?: (message: StageMessage) => void,
): Promise<T> {
  const id = nextRequestId;
  nextRequestId += 1;
  const target = getWorker();
  return new Promise<ResolveValue>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress, onStage });
    target.postMessage({ ...message, id });
  }) as Promise<T>;
}

/** Load (and cache, inside the worker) the all-card index, reporting decoding progress. */
export function loadCardIndex(onProgress?: ProgressListener): Promise<AllCardIndexSummary> {
  return request<AllCardIndexSummary>({ type: "load-index" }, onProgress);
}

/** Result of a scan: the ranked match candidates plus the geometry the scanner used (the
 *  detected card frame and the OCR title region), for drawing a UI overlay on the photo. */
export type ScanResult = { matches: MatchCandidate[]; overlay: ScanOverlay | null };

/** The live stages a scan passes through, surfaced to the UI as they happen:
 *  `detecting` (finding the card frame) → `analyzing` (perceptual image analysis) →
 *  `reading` (OCR of the title, with the preliminary card already shown) → `done`. */
export type ScanPhase = "detecting" | "analyzing" | "reading" | "done";

/** A live progress update during a scan. `overlay`/`matches` accumulate as they become known;
 *  `analyze`/`ocr` are 0..1 progress fractions for the respective stage. */
export type ScanProgress = {
  phase: ScanPhase;
  overlay: ScanOverlay | null;
  matches: MatchCandidate[];
  analyze: number;
  ocr: number;
};

/** Analyse a captured card photo and return the ranked match candidates (perceptual, with an
 *  OCR-of-title fallback for hard photos) plus the scan geometry overlay.
 *
 *  `onProgress` (optional) fires as each stage advances so the UI can show the pipeline live:
 *  the frame the instant it is detected, image-analysis progress, the preliminary card the
 *  moment perceptual matching resolves, then OCR progress before the refined final result. */
export async function scanImage(
  blob: Blob,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  let overlay: ScanOverlay | null = null;
  let matches: MatchCandidate[] = [];
  const emit = (phase: ScanPhase, extra?: { analyze?: number; ocr?: number }) =>
    onProgress?.({ phase, overlay, matches, analyze: extra?.analyze ?? 0, ocr: extra?.ocr ?? 0 });

  emit("detecting");
  const scan = await request<ScannedMessage>({ type: "scan", blob }, undefined, (stage) => {
    if (stage.type === "scan-frame") {
      overlay = stage.overlay;
      emit("analyzing", { analyze: 0 });
    } else {
      emit("analyzing", { analyze: stage.total ? stage.done / stage.total : 1 });
    }
  });
  overlay = scan.overlay ?? overlay;
  matches = scan.matches;

  if (!scan.titleBitmap || !scan.signatures) {
    emit("done");
    return { matches, overlay }; // safety
  }

  emit("reading", { ocr: 0 }); // preliminary card is now known; OCR refines it

  let ocrText: string;
  try {
    ocrText = await recognizeCardTitle(scan.titleBitmap, (fraction) => emit("reading", { ocr: fraction }));
  } catch {
    emit("done");
    return { matches, overlay }; // OCR is best-effort
  } finally {
    scan.titleBitmap.close();
  }

  const title = await request<TitleMatchesMessage>({
    type: "match-title",
    ocrText,
    signatures: scan.signatures,
  });
  matches = decideMatches(scan.matches, { matches: title.matches, nameScore: title.nameScore }).matches;
  emit("done");
  return { matches, overlay };
}
