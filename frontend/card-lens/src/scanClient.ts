//! Main-thread client for the scan worker. Orchestrates the hybrid flow: the worker does the
//! heavy perceptual matching and index lookups; if that is not confident, the client runs
//! title OCR here on the main thread (Tesseract spawns its own worker, so the OCR CPU stays
//! off the main thread) and asks the worker to resolve the printing from the recognized name.
import type { AllCardIndexSummary } from "./allCardIndex";
import { decideMatches, OCR_NAME_MIN, OCR_NAME_MIN_CORROBORATED, OCR_NAME_TRUST } from "./hybridDecision";
import type { CardQuad, ScanOverlay } from "./imageHash";
import type { ScanProfile } from "./scanWorker";
import { matchBasicLandName, matchCardName } from "./nameIndex";
import { recognizeCardTitle } from "./titleOcr";
import type { ImageSignature, MatchCandidate } from "./types";

export type { ScanOverlay, CardQuad } from "./imageHash";

// Shrink a quad vertically to the [top, bottom] fraction band (used to narrow the OCR overlay box
// from the full top strip down to the isolated title band).
function shrinkQuadToBand(quad: CardQuad, top: number, bottom: number): CardQuad {
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return {
    topLeft: lerp(quad.topLeft, quad.bottomLeft, top),
    topRight: lerp(quad.topRight, quad.bottomRight, top),
    bottomRight: lerp(quad.topRight, quad.bottomRight, bottom),
    bottomLeft: lerp(quad.topLeft, quad.bottomLeft, bottom),
  };
}

type ProgressListener = (done: number, total: number) => void;
type Signatures = { identification: ImageSignature[]; printing: ImageSignature[] };

type ScannedMessage = {
  type: "scanned";
  id: number;
  matches: MatchCandidate[];
  confident: boolean;
  profile?: ScanProfile;
  signatures?: Signatures;
  overlay?: ScanOverlay;
};
type TitleMatchesMessage = { type: "title-matches"; id: number; matches: MatchCandidate[]; nameScore: number };
type FrameMessage = { type: "scan-frame"; id: number; overlay: ScanOverlay };
type AnalyzeMessage = { type: "scan-analyze"; id: number; done: number; total: number };
type TitleReadyMessage = { type: "title-ready"; id: number; titleBitmap: ImageBitmap; fullArtNameBitmap: ImageBitmap };
type StageMessage = FrameMessage | AnalyzeMessage | TitleReadyMessage;

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
      case "title-ready":
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

/** Perceptual-only scan: the worker's image match with no OCR and no title round-trip.
 *
 *  Not used by the scanner itself — perceptual matching alone is not a safe identity signal (see
 *  the gate notes in App.tsx), so both the still and the live path run the hybrid `scanImage`.
 *  This stays as the benchmark harness's way to measure the matcher on its own. */
export async function scanImageFast(blob: Blob): Promise<MatchCandidate[]> {
  const scan = await request<ScannedMessage>({ type: "scan", blob, fast: true });
  lastFastScanProfile = scan.profile ?? null;
  return scan.matches;
}

/** Per-stage timings of the most recent `scanImageFast` call, for the benchmark harness. */
export let lastFastScanProfile: ScanProfile | null = null;

/** What one scan established, beyond the ranked candidates: how the identity was decided and how
 *  strongly the title was read. The live scanner gates auto-adding on this. */
export type ScanEvidence = {
  /** Best card-name match from OCR, 0 when the title could not be read at all. */
  nameScore: number;
  /** True when perceptual matching and OCR independently agreed on the card's name. */
  agreed: boolean;
  /** True when OCR read a name confidently enough to be trusted as the identity. */
  titleRead: boolean;
  /** Wall time (ms) spent in OCR, and whether the full-art name banner had to be read. */
  ocrMs: number;
  usedBanner: boolean;
};

export type ScanResultWithEvidence = ScanResult & { evidence: ScanEvidence };

/** Run the OCR half of a scan: recognise the card's name from its title bar, and — only when that
 *  fails — additionally read the lower name banner, where **full-art** cards carry their name.
 *
 *  The banner result is returned as a *candidate*, never as the answer. That region is genuinely
 *  ambiguous: on an ordinary card it holds the type line and the top of the rules box, and rules
 *  text routinely names a basic land type ("search your library for a Forest card"), which reads
 *  as an exact land name. Taking it at face value auto-added the wrong card for such cards. The
 *  caller therefore only accepts it when the perceptual match independently agrees the card is
 *  that land — the same two-signal rule that makes the title-bar path safe. */
async function readTitle(
  titleBitmap: ImageBitmap,
  fullArtNameBitmap: ImageBitmap,
  onOcrProgress: (fraction: number) => void,
): Promise<{ text: string; band: [number, number] | null; landCandidate: string | null }> {
  // `isConclusive` runs after every pass, so its last verdict already holds the match for the
  // full accumulated text — keep it rather than re-running `matchCardName`, which scans all
  // ~35k card names and costs more than a Tesseract pass on a short title.
  // Boxed so TypeScript does not narrow it to `null` from the callback assignment.
  const lastTopMatch: { value: Awaited<ReturnType<typeof matchCardName>> } = { value: null };
  const isConclusive = async (text: string) => {
    lastTopMatch.value = await matchCardName(text);
    return Boolean(lastTopMatch.value && lastTopMatch.value.score >= OCR_NAME_TRUST);
  };
  try {
    const top = await recognizeCardTitle(titleBitmap, { onProgress: onOcrProgress, isConclusive });
    if (lastTopMatch.value && lastTopMatch.value.score >= OCR_NAME_MIN) return { ...top, landCandidate: null };

    const banner = await recognizeCardTitle(fullArtNameBitmap, { onProgress: onOcrProgress, bandSearchFraction: 1 });
    const land = await matchBasicLandName(banner.text);
    return { ...top, landCandidate: land?.name ?? null };
  } finally {
    titleBitmap.close();
    fullArtNameBitmap.close();
  }
}

/** Analyse a captured card photo and return the ranked match candidates plus the scan geometry
 *  overlay and the evidence behind the decision.
 *
 *  Perceptual matching and title OCR are two independent identity signals and are run
 *  **concurrently**: the worker hands back the title crop before it starts fine-ranking, so
 *  Tesseract works through it while the worker is still matching. A hybrid scan therefore costs
 *  about max(perceptual, OCR) rather than their sum.
 *
 *  `onProgress` (optional) fires as each stage advances so the UI can show the pipeline live:
 *  the frame the instant it is detected, image-analysis progress, the preliminary card the
 *  moment perceptual matching resolves, then OCR progress before the refined final result.
 *
 *  `ocrTimeoutMs` (optional) caps the OCR wait. Tesseract is fast on a readable title (~200 ms)
 *  but can grind for seconds on an unreadable one; the live scanner uses this to keep every
 *  frame inside its latency budget, falling back to "title not read" rather than stalling. */
export async function scanImage(
  blob: Blob,
  onProgress?: (progress: ScanProgress) => void,
  ocrTimeoutMs?: number,
): Promise<ScanResultWithEvidence> {
  let overlay: ScanOverlay | null = null;
  let matches: MatchCandidate[] = [];
  const emit = (phase: ScanPhase, extra?: { analyze?: number; ocr?: number }) =>
    onProgress?.({ phase, overlay, matches, analyze: extra?.analyze ?? 0, ocr: extra?.ocr ?? 0 });

  emit("detecting");

  // Started by the "title-ready" stage message, which the worker posts before it begins the
  // perceptual match — this is what makes OCR overlap the matching instead of following it.
  // Held in an object so TypeScript does not narrow it to `null` from the callback assignment.
  const pendingOcr: {
    promise: Promise<{ text: string; band: [number, number] | null; landCandidate: string | null }> | null;
    startedAt: number;
  } = { promise: null, startedAt: 0 };

  const scan = await request<ScannedMessage>({ type: "scan", blob }, undefined, (stage) => {
    if (stage.type === "title-ready") {
      emit("reading", { ocr: 0 });
      pendingOcr.startedAt = performance.now();
      pendingOcr.promise = readTitle(stage.titleBitmap, stage.fullArtNameBitmap, (fraction) => emit("reading", { ocr: fraction }));
    } else if (stage.type === "scan-frame") {
      overlay = stage.overlay;
      emit("analyzing", { analyze: 0 });
    } else {
      emit("analyzing", { analyze: stage.total ? stage.done / stage.total : 1 });
    }
  });
  overlay = scan.overlay ?? overlay;
  matches = scan.matches;
  const ocrElapsed = () => performance.now() - pendingOcr.startedAt;
  const noEvidence = (): ScanEvidence => ({ nameScore: 0, agreed: false, titleRead: false, ocrMs: ocrElapsed(), usedBanner: false });

  const ocr = pendingOcr.promise;
  if (!ocr || !scan.signatures) {
    emit("done");
    return { matches, overlay, evidence: noEvidence() }; // safety
  }

  // OCR is best-effort: a failure or a timeout leaves the perceptual result standing, flagged as
  // "title not read" so the live scanner knows not to trust it enough to auto-add. The budget is
  // measured from when OCR STARTED, not from here — OCR has been running concurrently with the
  // perceptual match, so anchoring it here would silently grant it the matching time on top.
  const ocrRemainingMs =
    ocrTimeoutMs === undefined ? undefined : Math.max(0, ocrTimeoutMs - (performance.now() - pendingOcr.startedAt));
  const recognized = await Promise.race([
    ocr.catch(() => null),
    ocrRemainingMs === undefined
      ? new Promise<never>(() => {})
      : new Promise<null>((resolve) => setTimeout(() => resolve(null), ocrRemainingMs)),
  ]);
  if (!recognized) {
    emit("done");
    return { matches, overlay, evidence: noEvidence() };
  }

  // Tighten the displayed OCR box from the full top strip down to the actual title band that
  // OCR isolated — the region the title was really read from.
  if (overlay && recognized.band) {
    overlay = { ...overlay, ocr: shrinkQuadToBand(overlay.ocr, recognized.band[0], recognized.band[1]) };
    emit("reading", { ocr: 1 });
  }

  // A full-art card's name only comes from the lower banner, which is ambiguous on its own (see
  // readTitle). Accept it solely when perceptual matching independently agrees the card is that
  // basic land — two signals, as everywhere else in this pipeline.
  const perceptualName = scan.matches[0]?.card.name.toLowerCase() ?? "";
  const usedBanner = Boolean(recognized.landCandidate && perceptualName === recognized.landCandidate);
  const ocrText = usedBanner ? (recognized.landCandidate as string) : recognized.text;

  const title = await request<TitleMatchesMessage>({
    type: "match-title",
    ocrText,
    signatures: scan.signatures,
  });
  const decision = decideMatches(scan.matches, { matches: title.matches, nameScore: title.nameScore });
  matches = decision.matches;
  emit("done");

  // The identity is established either by a title read strong enough to stand alone, or by a
  // weaker read that perceptual matching independently landed on the same card as.
  const agreed = Boolean(
    title.matches[0] && scan.matches[0] && title.matches[0].card.name === scan.matches[0].card.name,
  );
  const titleRead =
    title.matches.length > 0 &&
    (title.nameScore >= OCR_NAME_MIN || (agreed && title.nameScore >= OCR_NAME_MIN_CORROBORATED));

  return {
    matches,
    overlay,
    evidence: { nameScore: title.nameScore, titleRead, ocrMs: ocrElapsed(), usedBanner, agreed },
  };
}
