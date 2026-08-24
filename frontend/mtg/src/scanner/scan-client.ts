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
const listeners = new Map<number, (status: string) => void>();

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
            listeners.get(message.id)?.(message.status);
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
                region: message.region,
                timings: message.timings,
                preview: message.preview,
                outcome: message.outcome,
                milliseconds: message.milliseconds,
            } as never);
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
 * @param onProgress receives status updates for this request
 * @returns the worker's answer
 */
function request<T>(
    build: (id: number) => object,
    transfer: Transferable[] = [],
    onProgress?: (status: string) => void,
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
 * @param onProgress receives a short status while loading
 * @returns what was loaded
 */
export function loadScanner(onProgress?: (status: string) => void): Promise<ScannerStatus> {
    const strategy = plannedStrategy();
    return request<ScannerStatus>((id) => ({ type: "load", id, strategy }), [], onProgress).then((status) => {
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
    /** The part of the frame that was searched, so the guide marks exactly it */
    region: { x: number; y: number; width: number; height: number };
    /** Where the milliseconds went, for the debug view */
    timings: { detect: number; embed: number; search: number; ocr: number };
    /** What the title bar read, empty when nothing legible was found */
    title: string;
    /** Why reading failed, empty when it did not */
    ocrError: string;
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
 * @returns what this frame produced
 */
export function scanLiveFrame(frame: ImageBitmap, debug = false): Promise<LiveFrameResult> {
    return request<LiveFrameResult>((id) => ({ type: "live", id, frame, debug }), [frame]);
}

/**
 * Forgets how many frames have agreed so far, after a card is taken away or accepted
 */
export function resetLiveTracking(): void {
    ensureWorker().postMessage({ type: "reset", id: (nextId += 1) });
}
