//! Main-thread handle for the scan worker.
//!
//! One worker for the whole app, started on first use. Requests are numbered because a live
//! scanner fires them faster than they complete, and an answer that arrives after the card has
//! already been swapped has to be discardable by its caller rather than mistaken for the current
//! one.
import type { ScanReport } from "./pipeline";
import { nextStrategy } from "./webgpu-strategy";
import type { WebgpuStrategy } from "./webgpu-strategy";
import type { ScanOutcome } from "./scan-decision";
import type { CardQuad } from "./card-detect";
import type { IndexedPrinting } from "./embedding-index";
import type { ScanLanguageChoice } from "./ocr";

export type { ScanLanguage, ScanLanguageChoice } from "./ocr";
import type { ScanLoadProgress } from "./pipeline";

export type { ScanLoadProgress, ScanLoadStage } from "./pipeline";

/**
 * What the worker reports once it is loaded
 */
export type ScannerStatus = {
    printings: number;
    /** Which execution provider the model ended up on */
    backend: "webgpu" | "wasm";
    /** Which WebGPU arrangement this load tried */
    strategy: WebgpuStrategy;
    /** Version of the inference runtime that produced this verdict */
    runtime: string;
    /** Why a faster backend was passed over; empty when the first one worked */
    notes: string[];
};

/**
 * A request waiting for the worker's answer
 */
type Resolver = { resolve: (value: never) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Resolver>();
const listeners = new Map<number, (progress: ScanLoadProgress) => void>();

/**
 * Starts the worker on first use
 *
 * @returns the worker
 */
function ensureWorker(): Worker {
    if (worker) return worker;
    const created = new Worker(new URL("./scan-worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (event) => {
        const message = event.data;
        if (message.type === "progress") {
            listeners.get(message.id)?.(message.progress);
            return;
        }
        const resolver = pending.get(message.id);
        if (!resolver) return;
        pending.delete(message.id);
        listeners.delete(message.id);
        if (message.type === "error") resolver.reject(new Error(message.message));
        else if (message.type === "ready")
            resolver.resolve({
                printings: message.printings,
                backend: message.backend,
                strategy: message.strategy ?? "full",
                runtime: message.runtime ?? "",
                notes: message.notes ?? [],
            } as never);
        else if (message.type === "live")
            resolver.resolve({
                quad: message.quad,
                frameWidth: message.frameWidth,
                frameHeight: message.frameHeight,
                crop: message.crop,
                areaFraction: message.areaFraction,
                title: message.title ?? "",
                ocrError: message.ocrError ?? "",
                ocrModel: message.ocrModel ?? "",
                region: message.region,
                fromGuide: message.fromGuide ?? false,
                timings: message.timings,
                preview: message.preview,
                outcome: message.outcome,
                milliseconds: message.milliseconds,
            } as never);
        else if (message.type === "printings") resolver.resolve(message.printings as never);
        else if (message.type === "sets") resolver.resolve(message.sets as never);
        else resolver.resolve(message.report as never);
    };
    worker = created;
    return created;
}

/**
 * Sends one request and waits for its answer
 *
 * @param build produces the message for a given id
 * @param transfer objects handed over rather than copied
 * @param onProgress receives load progress for this request
 * @returns the worker's answer
 */
function request<T>(
    build: (id: number) => object,
    transfer: Transferable[] = [],
    onProgress?: (progress: ScanLoadProgress) => void,
): Promise<T> {
    const id = (nextId += 1);
    const target = ensureWorker();
    return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as never, reject });
        if (onProgress) listeners.set(id, onProgress);
        target.postMessage(build(id), transfer);
    });
}

/**
 * Loads index and model. Safe to call repeatedly; the worker keeps both.
 *
 * @param onProgress receives byte progress while loading
 * @param language which cards are going to be scanned, so the worker can warm the right reader
 * @returns what was loaded
 */
export function loadScanner(
    onProgress?: (progress: ScanLoadProgress) => void,
    language: ScanLanguageChoice = "auto",
): Promise<ScannerStatus> {
    const strategy = plannedStrategy();
    return request<ScannerStatus>((id) => ({ type: "load", id, strategy, language }), [], onProgress).then((status) => {
        rememberStrategy(strategy, status);
        return status;
    });
}

/** Where the WebGPU verdict for this device is kept between loads. */
const STRATEGY_KEY = "scanner.webgpu-strategy";

/**
 * Which WebGPU arrangement this load should try.
 *
 * The library only reads `env.webgpu.adapter` before its first session, so an arrangement can
 * only be tested by deciding it up front — one per page load. Remembering the verdict is not just
 * tidiness either: finding it out costs a graph build over an 85 MB model, and on a device where
 * WebGPU cannot work the answer has never once changed.
 *
 * The verdict is stored against the runtime version that produced it, and a different version
 * starts over. Without that the note is a trap: this fails because of a bug in the inference
 * library, the fix will arrive as a new version of exactly that library, and a verdict that
 * outlived it would make sure the fix was never noticed.
 *
 * @returns the arrangement to try
 */
function plannedStrategy(): WebgpuStrategy {
    try {
        const [, stored] = (localStorage.getItem(STRATEGY_KEY) ?? "").split(" ");
        return stored === "no-subgroups" || stored === "no-subgroups-f16" || stored === "off" ? stored : "full";
    } catch {
        return "full";
    }
}

/**
 * Records what this arrangement achieved, so the next load moves on.
 *
 * A working WebGPU is written down as such, which also means a browser or driver update that
 * fixes this is not locked out for good: the moment one succeeds, that is what gets stored.
 *
 * @param tried what this load attempted
 * @param status what the worker reported
 */
function rememberStrategy(tried: WebgpuStrategy, status: ScannerStatus): void {
    try {
        const reached = status.backend === "webgpu" ? tried : nextStrategy(tried);
        localStorage.setItem(STRATEGY_KEY, `${status.runtime} ${reached}`);
    } catch {
        // Private mode and blocked storage are fine; it just costs the attempts again.
    }
}

/**
 * Recognises the card in one frame. The bitmap is transferred and closed by the worker.
 *
 * @param frame
 * @returns what was found
 */
export function scanFrame(frame: ImageBitmap): Promise<ScanReport> {
    return request<ScanReport>((id) => ({ type: "scan", id, frame }), [frame]);
}

/**
 * What one live frame produced
 */
export type LiveFrameResult = {
    quad: CardQuad | null;
    /** The frame's own pixel size, which the overlay needs to place the quad */
    frameWidth: number;
    frameHeight: number;
    /** What the recogniser saw, only in debug mode */
    crop: ImageBitmap | null;
    /** How much of the frame the detection covers, 0 to 1 */
    areaFraction: number;
    /** The part of the frame that was searched */
    region: { x: number; y: number; width: number; height: number };
    /** Whether the crop came from the guide because detection found nothing */
    fromGuide: boolean;
    /** Where the milliseconds went, for the debug view */
    timings: { detect: number; embed: number; search: number; ocr: number };
    /** What the title bar read, empty when nothing legible was found */
    title: string;
    /** Why reading failed, empty when it did not */
    ocrError: string;
    /** Which traineddata read the title */
    ocrModel: string;
    preview: { name: string; set: string; collectorNumber: string; score: number } | null;
    /** Only set on frames where the answer was actually confirmed */
    outcome: ScanOutcome | null;
    milliseconds: number;
};

/**
 * Runs one live frame: always the cheap half, the expensive half only when frames agree.
 *
 * @param frame transferred to the worker, which closes it
 * @param debug also return the rectified crop, so a wrong answer can be looked at
 * @param language which language of card is being held up, which picks the OCR model
 * @param sets set codes the scan is narrowed to, empty for all
 * @param viewAspect width over height of the element showing the picture
 * @returns what this frame produced
 */
export function scanLiveFrame(
    frame: ImageBitmap,
    debug = false,
    language: ScanLanguageChoice = "auto",
    sets: string[] = [],
    viewAspect = 0,
): Promise<LiveFrameResult> {
    return request<LiveFrameResult>((id) => ({ type: "live", id, frame, debug, language, sets, viewAspect }), [frame]);
}

/**
 * Every printing the catalogue files under a name.
 *
 * Served from the index the scanner already holds, which carries all 450000 printings: correcting
 * a printing costs no second catalogue and no further download.
 *
 * @param name as read from the card or as catalogued
 * @returns the printings, empty for an unknown name
 */
export function listPrintingsNamed(name: string): Promise<IndexedPrinting[]> {
    return request<IndexedPrinting[]>((id) => ({ type: "printings", id, name }));
}

/**
 * Every set the catalogue holds, for narrowing a scan to the box being sorted.
 *
 * @returns the sets, largest first
 */
export function listScanSets(): Promise<{ code: string; name: string; cardCount: number }[]> {
    return request<{ code: string; name: string; cardCount: number }[]>((id) => ({ type: "sets", id }));
}

/**
 * Forgets how many frames have agreed so far, after a card is taken away or accepted
 */
export function resetLiveTracking(): void {
    ensureWorker().postMessage({ type: "reset", id: (nextId += 1) });
}

/** Where the packed index lives, mirrored from the pipeline so the page need not import it. */
const INDEX_ROOT = "/data/scan-index";

/**
 * What a first scan would have to download, and whether it already happened
 */
export type ScanDownload = {
    /** Transfer size of the index, in bytes */
    total: number;
    /** Whether every payload file of this build is already in the browser's cache */
    cached: boolean;
};

/**
 * Asks what the scanner still needs before it can run.
 *
 * Answered from the manifest and the cache rather than by starting the download: the whole point
 * is to be able to say what a load costs before committing someone's mobile data to it, and to
 * skip asking at all once the files are on the device.
 *
 * @returns the size and whether it is already paid for
 */
export async function inspectScanDownload(): Promise<ScanDownload> {
    const response = await fetch(`${INDEX_ROOT}/manifest.json`);
    if (!response.ok) throw new Error(`${INDEX_ROOT}/manifest.json: HTTP ${response.status}`);
    const manifest = (await response.json()) as { version?: string; bytes?: Record<string, number> };
    const total = Object.values(manifest.bytes ?? {}).reduce((sum, size) => sum + size, 0);

    const version = manifest.version ? `?v=${manifest.version}` : "";
    const files = ["projection.f32", "vectors.i8", "cards.json.gz"];
    // Cache Storage may be unavailable, in a private window for one, and a missing cache simply
    // means the download has not happened yet.
    const hits = await Promise.all(
        files.map((file) =>
            caches
                .match(`${INDEX_ROOT}/${file}${version}`, { ignoreVary: true })
                .then((hit) => Boolean(hit))
                .catch(() => false),
        ),
    );
    return { total, cached: hits.every(Boolean) };
}

/**
 * Asks the browser not to evict what the scanner is about to download.
 *
 * Cache Storage is best effort by default: under storage pressure a browser may throw the index
 * away, and the next scan then quietly costs another 85 MB. Requesting durability is only granted
 * off the back of a user gesture, which is why this belongs on the button that agreed to the
 * download rather than on page load.
 *
 * @returns whether storage is now durable, false where the browser does not offer the choice
 */
export async function keepScanDataStored(): Promise<boolean> {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist().catch(() => false);
}
