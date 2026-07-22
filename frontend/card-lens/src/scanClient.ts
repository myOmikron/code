//! Main-thread client for the scan worker. Orchestrates the hybrid flow: the worker does the
//! heavy perceptual matching and index lookups; if that is not confident, the client runs
//! title OCR here on the main thread (Tesseract spawns its own worker, so the OCR CPU stays
//! off the main thread) and asks the worker to resolve the printing from the recognized name.
import type { AllCardIndexSummary } from "./allCardIndex";
import { decideMatches } from "./hybridDecision";
import { recognizeCardTitle } from "./titleOcr";
import type { ImageSignature, MatchCandidate } from "./types";

type ProgressListener = (done: number, total: number) => void;
type Signatures = { identification: ImageSignature[]; printing: ImageSignature[] };

type ScannedMessage = {
  type: "scanned";
  id: number;
  matches: MatchCandidate[];
  confident: boolean;
  signatures?: Signatures;
  titleBitmap?: ImageBitmap;
};
type TitleMatchesMessage = { type: "title-matches"; id: number; matches: MatchCandidate[]; nameScore: number };

type IncomingMessage =
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "index-ready"; id: number; summary: AllCardIndexSummary }
  | ScannedMessage
  | TitleMatchesMessage
  | { type: "error"; id: number; message: string };

type ResolveValue = AllCardIndexSummary | ScannedMessage | TitleMatchesMessage;
type PendingRequest = {
  resolve: (value: ResolveValue) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressListener;
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
): Promise<T> {
  const id = nextRequestId;
  nextRequestId += 1;
  const target = getWorker();
  return new Promise<ResolveValue>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    target.postMessage({ ...message, id });
  }) as Promise<T>;
}

/** Load (and cache, inside the worker) the all-card index, reporting decoding progress. */
export function loadCardIndex(onProgress?: ProgressListener): Promise<AllCardIndexSummary> {
  return request<AllCardIndexSummary>({ type: "load-index" }, onProgress);
}

/** Analyse a captured card photo and return the ranked match candidates (perceptual, with an
 *  OCR-of-title fallback for hard photos). */
const fmt = (matches: MatchCandidate[]) =>
  matches.map((m) => `${m.card.setCode}#${m.card.collectorNumber} ${m.card.name} ${m.similarity.toFixed(3)}`);

export async function scanImage(blob: Blob): Promise<MatchCandidate[]> {
  const scan = await request<ScannedMessage>({ type: "scan", blob });
  console.info("[cardlens] perceptual:", fmt(scan.matches), "confident:", scan.confident);
  if (scan.confident || !scan.titleBitmap || !scan.signatures) return scan.matches;

  let ocrText: string;
  try {
    ocrText = await recognizeCardTitle(scan.titleBitmap);
  } catch (error) {
    console.warn("[cardlens] OCR failed, using perceptual:", error);
    return scan.matches; // OCR is best-effort
  } finally {
    scan.titleBitmap.close();
  }

  const title = await request<TitleMatchesMessage>({
    type: "match-title",
    ocrText,
    signatures: scan.signatures,
  });
  const decision = decideMatches(scan.matches, { matches: title.matches, nameScore: title.nameScore });
  console.info(
    "[cardlens] ocrText:", JSON.stringify(ocrText),
    "| titleMatches:", fmt(title.matches), "nameScore:", title.nameScore.toFixed(3),
    "| decision:", decision.method,
  );
  return decision.matches;
}
