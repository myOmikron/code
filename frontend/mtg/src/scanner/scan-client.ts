//! Main-thread handle for the scan worker.
//!
//! One worker for the whole app, started on first use. Requests are numbered because a live
//! scanner fires them faster than they complete, and an answer that arrives after the card has
//! already been swapped has to be discardable by its caller rather than mistaken for the current
//! one.
import type { ScanReport } from "./pipeline";
import type { ScanOutcome } from "./scan-decision";
import type { CardQuad } from "./card-detect";

/**
 * What the worker reports once it is loaded
 */
export type ScannerStatus = {
    printings: number;
    /** Which execution provider the model ended up on */
    backend: "webgpu" | "wasm";
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
            resolver.resolve({ printings: message.printings, backend: message.backend } as never);
        else if (message.type === "live")
            resolver.resolve({
                quad: message.quad,
                frameWidth: message.frameWidth,
                frameHeight: message.frameHeight,
                crop: message.crop,
                areaFraction: message.areaFraction,
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
    return request<ScannerStatus>((id) => ({ type: "load", id }), [], onProgress);
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
    timings: { detect: number; embed: number; search: number };
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
