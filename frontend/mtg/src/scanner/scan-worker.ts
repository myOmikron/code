/// <reference lib="webworker" />
//! Runs the recognition chain off the main thread.
//!
//! Everything here is CPU or GPU bound for seconds at a time: OpenCV's detection, the model, and
//! a few dozen descriptor comparisons. On the main thread that would freeze the camera preview,
//! which is the one part of the interface that has to stay smooth for the scanner to be usable
//! at all.
import { loadEmbedder } from "./embedder";
import type { Embedder } from "./embedder";
import { confirmPreview, createAgreementTracker, previewFrame } from "./live-pipeline";
import { loadScanIndex, scanFrame } from "./pipeline";
import type { LoadedIndex, ScanReport } from "./pipeline";
import type { ScanOutcome } from "./scan-decision";
import type { RgbaImage } from "./card-detect";

/**
 * Anything the main thread may send
 */
type IncomingMessage =
    | { type: "load"; id: number }
    | { type: "scan"; id: number; frame: ImageBitmap }
    | { type: "live"; id: number; frame: ImageBitmap; debug: boolean }
    | { type: "reset"; id: number };

/**
 * Anything the worker may send back
 */
type OutgoingMessage =
    | { type: "progress"; id: number; status: string }
    | { type: "ready"; id: number; printings: number; backend: Embedder["backend"] }
    | { type: "scanned"; id: number; report: ScanReport }
    | {
          type: "live";
          id: number;
          /** Where the card sits, so the overlay can follow it every frame */
          quad: ScanReport["quad"];
          /** The frame's own pixel size, which the overlay needs to place the quad */
          frameWidth: number;
          frameHeight: number;
          /** What the recogniser actually saw, sent only in debug mode */
          crop: ImageBitmap | null;
          /** How much of the frame the detection covers, 0 to 1 */
          areaFraction: number;
          /** The part of the frame that was searched, so the guide marks exactly it */
          region: { x: number; y: number; width: number; height: number };
          /** Where the milliseconds went, for the debug view */
          timings: { detect: number; embed: number; search: number };
          /** The leading candidate by embedding alone, shown while the answer is still forming */
          preview: { name: string; set: string; collectorNumber: string; score: number } | null;
          /** Set once the frame was confirmed; absent while the cheap half is still running */
          outcome: ScanOutcome | null;
          milliseconds: number;
      }
    | { type: "error"; id: number; message: string };

const worker = self as unknown as {
    /**
     * Posts a typed message back to the main thread
     *
     * @param message
     * @param transfer objects handed over rather than copied
     */
    postMessage(message: OutgoingMessage, transfer?: Transferable[]): void;
    onmessage: ((event: MessageEvent<IncomingMessage>) => void) | null;
};

let index: LoadedIndex | null = null;
let embedder: Embedder | null = null;
const agreement = createAgreementTracker();
// Counted so the crop variants can be spread over frames rather than all tried in each one.
let frameNumber = 0;

/**
 * Loads the index and the model, reporting progress as it goes
 *
 * @param id the request being answered
 */
async function load(id: number): Promise<void> {
    const report = (status: string) => worker.postMessage({ type: "progress", id, status });
    index ??= await loadScanIndex(report);
    embedder ??= await loadEmbedder(report);
    worker.postMessage({ type: "ready", id, printings: index.manifest.count, backend: embedder.backend });
}

/**
 * Copies a rectified crop into a bitmap the main thread can draw
 *
 * @param image the crop
 * @returns the bitmap, ownership transferred to the caller
 */
function toBitmap(image: RgbaImage): ImageBitmap {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D-Kontext im Worker nicht verfügbar");
    const pixels = context.createImageData(image.width, image.height);
    pixels.data.set(image.data);
    context.putImageData(pixels, 0, 0);
    return canvas.transferToImageBitmap();
}

/**
 * Turns a frame into the pixel buffer the chain works on
 *
 * @param frame
 * @returns the pixels
 */
function readPixels(frame: ImageBitmap): RgbaImage {
    const canvas = new OffscreenCanvas(frame.width, frame.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D-Kontext im Worker nicht verfügbar");
    context.drawImage(frame, 0, 0);
    const pixels = context.getImageData(0, 0, frame.width, frame.height);
    return { data: pixels.data, width: pixels.width, height: pixels.height };
}

worker.onmessage = async (event) => {
    const message = event.data;
    try {
        if (message.type === "load") {
            await load(message.id);
            return;
        }

        if (message.type === "reset") {
            agreement.reset();
            frameNumber = 0;
            return;
        }

        if (!index || !embedder) throw new Error("Der Scanner ist noch nicht bereit.");

        if (message.type === "live") {
            try {
                const pixels = readPixels(message.frame);
                const preview = await previewFrame(pixels, index, embedder, frameNumber);
                frameNumber += 1;
                const leader = preview.candidates[0] ?? null;
                const key = leader ? `${leader.printing.id}/${leader.printing.face}` : null;

                // Confirmation only once the same printing has led twice running. That is both a
                // sign the card is being held still and the moment the answer is worth the
                // reference downloads it costs.
                const outcome = agreement.seen(key) ? await confirmPreview(preview) : null;
                if (outcome?.status === "recognised") agreement.reset();

                // The crop is what makes a wrong answer explainable: a plausible card name over
                // a picture of the table says something entirely different from the same name
                // over a correctly cut card. Only built when asked for, it costs a copy.
                const crop = message.debug && preview.crops.length > 0 ? toBitmap(preview.crops[0]) : null;

                worker.postMessage(
                    {
                        type: "live",
                        id: message.id,
                        quad: preview.quad,
                        frameWidth: pixels.width,
                        frameHeight: pixels.height,
                        crop,
                        areaFraction: preview.areaFraction,
                        region: preview.region,
                        preview: leader
                            ? {
                                  name: leader.printing.name,
                                  set: leader.printing.set,
                                  collectorNumber: leader.printing.collectorNumber,
                                  score: leader.score,
                              }
                            : null,
                        outcome,
                        milliseconds: preview.milliseconds,
                        timings: preview.timings,
                    },
                    crop ? [crop] : [],
                );
            } finally {
                message.frame.close();
            }
            return;
        }

        try {
            const report = await scanFrame(readPixels(message.frame), index, embedder);
            worker.postMessage({ type: "scanned", id: message.id, report });
        } finally {
            message.frame.close();
        }
    } catch (error) {
        worker.postMessage({
            type: "error",
            id: message.id,
            message: error instanceof Error ? error.message : "Die Karte konnte nicht analysiert werden.",
        });
    }
};
