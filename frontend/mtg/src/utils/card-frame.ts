/**
 * Main-thread client of the OpenCV frame-detection worker.
 *
 * The live scanner calls this once per loop iteration: `detectCardQuad` finds the card border in
 * a downscaled camera frame (Canny → Hough → quad, see the worker), `rectifyCard` warps the
 * full-resolution region behind that quad into an upright 63:88 card image.
 *
 * Everything degrades gracefully around a state machine: the detector is `loading` until the
 * worker's WASM runtime reports in, `ready` afterwards, and `broken` once the worker died or the
 * runtime failed to initialise — the caller uses the fixed guide-box crop in every state except
 * `ready`, so a failing OpenCV never stalls the scanner.
 */

import type { CardQuad } from "./scan-client";

/** A request waiting on the worker */
type PendingRequest = {
    resolve: (value: DetectedMessage | RectifiedMessage) => void;
    reject: (error: Error) => void;
};

/** The worker's answer to a detection request */
type DetectedMessage = { type: "detected"; id: number; quad: CardQuad | null };
/** The worker's answer to a rectification request */
type RectifiedMessage = { type: "rectified"; id: number; pixels: ArrayBuffer };
/** The worker's report of a failed request */
type FailedMessage = { type: "failed"; id: number; message: string };
/** The worker's init handshake */
type LifecycleMessage = { type: "ready" } | { type: "init-failed"; message: string };
/** Everything the worker sends */
type IncomingMessage = DetectedMessage | RectifiedMessage | FailedMessage | LifecycleMessage;

/** Where the detector currently stands, see the module comment */
export type FrameDetectorState = "idle" | "loading" | "ready" | "broken";

/** After this many request failures in a row the worker is considered unusable. */
const MAX_CONSECUTIVE_FAILURES = 3;

let worker: Worker | null = null;
let state: FrameDetectorState = "idle";
let consecutiveFailures = 0;
let nextRequestId = 0;
const pending = new Map<number, PendingRequest>();

/**
 * Gives up on the worker for good and lets the caller fall back
 *
 * @param reason what went wrong, for the console
 */
function markBroken(reason: string): void {
    // A console warning rather than UI: the scanner keeps working through its fallback, and the
    // reason only matters when someone investigates why frame detection is off.
    console.warn("[card-frame] frame detection disabled:", reason);
    state = "broken";
    const error = new Error(reason);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
}

/**
 * The detection worker, started on first use
 *
 * @returns the worker, or `null` after it has proven unusable
 */
function getWorker(): Worker | null {
    if (state === "broken") return null;
    if (worker) return worker;
    try {
        const created = new Worker(new URL("./frame-detect-worker.ts", import.meta.url), { type: "module" });
        console.info("[card-frame] OpenCV worker created");
        state = "loading";
        created.onmessage = (event: MessageEvent<IncomingMessage>) => {
            const message = event.data;
            if (message.type === "ready") {
                state = "ready";
                console.info("[card-frame] OpenCV ready");
                return;
            }
            if (message.type === "init-failed") {
                console.error("[card-frame] OpenCV init failed:", message.message);
                markBroken(message.message);
                return;
            }
            const request = pending.get(message.id);
            if (!request) return;
            pending.delete(message.id);
            if (message.type === "failed") {
                request.reject(new Error(message.message));
                consecutiveFailures += 1;
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) markBroken(message.message);
            } else {
                consecutiveFailures = 0;
                request.resolve(message);
            }
        };
        created.onerror = (event) => {
            console.error("[card-frame] OpenCV worker error:", event.message || event);
            markBroken(event.message || "Der Erkennungs-Worker ist abgestürzt.");
        };
        worker = created;
        return created;
    } catch (error) {
        markBroken(error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Sends one request to the worker and waits for its answer
 *
 * @param message the request, without an id
 * @param transfer buffers to move rather than copy
 * @returns the worker's answer
 */
function request<T extends DetectedMessage | RectifiedMessage>(
    message: Record<string, unknown>,
    transfer: Transferable[],
): Promise<T> {
    const target = getWorker();
    if (!target) return Promise.reject(new Error("Frame-Erkennung nicht verfügbar."));
    const id = nextRequestId;
    nextRequestId += 1;
    return new Promise<DetectedMessage | RectifiedMessage>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        target.postMessage({ ...message, id }, transfer);
    }) as Promise<T>;
}

/**
 * Where the detector currently stands — the live loop only takes the OpenCV path on `"ready"`
 *
 * @returns the state
 */
export function frameDetectorState(): FrameDetectorState {
    return state;
}

/**
 * Starts the worker (and the OpenCV download behind it) ahead of the first frame
 */
export function warmFrameDetector(): void {
    getWorker();
}

/**
 * Finds the card's border quad in a camera frame
 *
 * @param frame the downscaled frame to analyse
 * @returns the quad in the frame's coordinates, or `null` when no card border is found
 */
export async function detectCardQuad(frame: ImageData): Promise<CardQuad | null> {
    const buffer = frame.data.buffer as ArrayBuffer;
    const answer = await request<DetectedMessage>(
        { type: "detect", width: frame.width, height: frame.height, pixels: buffer },
        [buffer],
    );
    return answer.quad;
}

/**
 * Warps the region behind a quad into an upright card image
 *
 * @param frame the full-resolution frame
 * @param quad the card border, in the frame's coordinates
 * @param outWidth width of the rectified card
 * @param outHeight height of the rectified card
 * @returns the rectified card
 */
export async function rectifyCard(
    frame: ImageData,
    quad: CardQuad,
    outWidth: number,
    outHeight: number,
): Promise<ImageData> {
    const buffer = frame.data.buffer as ArrayBuffer;
    const answer = await request<RectifiedMessage>(
        { type: "rectify", width: frame.width, height: frame.height, pixels: buffer, quad, outWidth, outHeight },
        [buffer],
    );
    return new ImageData(new Uint8ClampedArray(answer.pixels), outWidth, outHeight);
}
