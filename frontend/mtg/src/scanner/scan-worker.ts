/// <reference lib="webworker" />
//! Runs the recognition chain off the main thread.
//!
//! Everything here is CPU or GPU bound for seconds at a time: OpenCV's detection, the model, and
//! a few dozen descriptor comparisons. On the main thread that would freeze the camera preview,
//! which is the one part of the interface that has to stay smooth for the scanner to be usable
//! at all.
import { loadEmbedder } from "./embedder";
import type { WebgpuStrategy } from "./webgpu-strategy";
import type { Embedder } from "./embedder";
import {
    confirmPreview,
    createAgreementTracker,
    createVariantSelector,
    previewFrame,
    uprightVariant,
} from "./live-pipeline";
import { loadScanIndex, scanFrame } from "./pipeline";
import type { LoadedIndex, ScanLoadProgress, ScanReport } from "./pipeline";
import type { IndexedPrinting } from "./embedding-index";
import type { ScanLanguageChoice } from "./ocr";
import type { ScanOutcome } from "./scan-decision";
import type { RgbaImage } from "./card-detect";

/**
 * Anything the main thread may send
 */
type IncomingMessage =
    | { type: "load"; id: number; strategy?: WebgpuStrategy }
    | { type: "scan"; id: number; frame: ImageBitmap }
    | {
          type: "live";
          id: number;
          frame: ImageBitmap;
          debug: boolean;
          language?: ScanLanguageChoice;
          sets?: string[];
          viewAspect?: number;
      }
    | { type: "reset"; id: number }
    | { type: "printings"; id: number; name: string }
    | { type: "sets"; id: number };

/**
 * Anything the worker may send back
 */
type OutgoingMessage =
    | { type: "progress"; id: number; progress: ScanLoadProgress }
    | {
          type: "ready";
          id: number;
          printings: number;
          backend: Embedder["backend"];
          notes: string[];
          strategy: WebgpuStrategy;
          runtime: string;
      }
    | { type: "scanned"; id: number; report: ScanReport }
    | { type: "printings"; id: number; printings: IndexedPrinting[] }
    | { type: "sets"; id: number; sets: { code: string; name: string; cardCount: number }[] }
    | {
          type: "live";
          id: number;
          /** Where the card sits, so the overlay can follow it every frame */
          quad: ScanReport["quad"];
          /** The frame's own pixel size, which the overlay needs to place the quad */
          frameWidth: number;
          frameHeight: number;
          /** What the title bar read, empty when nothing legible was found */
          title: string;
          /** Why reading failed, empty when it did not */
          ocrError: string;
          ocrModel: string;
          /** What the recogniser actually saw, sent only in debug mode */
          crop: ImageBitmap | null;
          /** How much of the frame the detection covers, 0 to 1 */
          areaFraction: number;
          /** The part of the frame that was searched, so the guide marks exactly it */
          region: { x: number; y: number; width: number; height: number };
          fromGuide: boolean;
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
const variants = createVariantSelector();
/** Whether the last frame read a name, which makes exploring pointless. */
let named = false;
// Counted so the crop variants can be spread over frames rather than all tried in each one.

/**
 * Loads the index and the model, reporting progress as it goes
 *
 * @param id the request being answered
 * @param strategy which WebGPU arrangement to try, from what earlier loads found out
 */
async function load(id: number, strategy: WebgpuStrategy): Promise<void> {
    const post = (progress: ScanLoadProgress) => worker.postMessage({ type: "progress", id, progress });

    // The bar follows the catalogue, which is the half that can be counted, and the model only
    // changes the label beside it. Letting the model post a progress of its own would knock the
    // bar back to nothing every time it said something, now that the two run at once.
    let counted = { loaded: 0, total: 0 };
    const postIndex = (progress: ScanLoadProgress) => {
        counted = { loaded: progress.loaded, total: progress.total };
        post(progress);
    };

    // Started together rather than one after the other. They need nothing from each other: the
    // catalogue is downloaded and parsed, the model is downloaded and handed to the inference
    // runtime, and running them in sequence simply added the two waits together.
    const [loadedIndex, loadedEmbedder] = await Promise.all([
        index ?? loadScanIndex(postIndex),
        embedder ?? loadEmbedder((detail) => post({ stage: "model", ...counted, detail }), strategy),
    ]);
    index = loadedIndex;
    embedder = loadedEmbedder;

    worker.postMessage({
        type: "ready",
        id,
        printings: index.manifest.count,
        backend: embedder.backend,
        notes: embedder.notes,
        strategy,
        runtime: embedder.runtime,
    });
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
            await load(message.id, message.strategy ?? "full");
            return;
        }

        if (message.type === "reset") {
            agreement.reset();
            variants.reset();
            return;
        }

        // Answered from the index alone, so a printing can be corrected the moment the catalogue
        // is in, without waiting on the model.
        if (message.type === "sets") {
            if (!index) throw new Error("Der Scanner ist noch nicht bereit.");
            worker.postMessage({ type: "sets", id: message.id, sets: index.sets() });
            return;
        }

        if (message.type === "printings") {
            if (!index) throw new Error("Der Scanner ist noch nicht bereit.");
            worker.postMessage({ type: "printings", id: message.id, printings: index.printingsNamed(message.name) });
            return;
        }

        if (!index || !embedder) throw new Error("Der Scanner ist noch nicht bereit.");

        if (message.type === "live") {
            try {
                const pixels = readPixels(message.frame);
                const variant = variants.next(named);
                const preview = await previewFrame(
                    pixels,
                    index,
                    embedder,
                    variant,
                    message.language ?? "auto",
                    message.sets ?? [],
                );
                // The variant is judged on what the picture alone did with it. Judging it on the
                // merged leader would reward the variants where the name could *not* be read, since
                // a search across the whole index returns bigger numbers than one within a name.
                variants.record(variant, preview.sightScore);
                const leader = preview.candidates[0] ?? null;
                const key = leader ? `${leader.printing.id}/${leader.printing.face}` : null;

                named = preview.named;

                // Confirmation only once the same printing has led twice running. That is both a
                // sign the card is being held still and the moment the answer is worth the
                // reference downloads it costs.
                //
                // Only upright frames get a vote. The rotated variants are sampled to help the
                // model and are never settled on, yet their answers were going into the same
                // window: with one frame in three exploring, a window of four held more than one
                // crop that was not even the right way up, and a stray high score from one of
                // those both blocked the real answer and, on the third try, replaced it.
                const outcome =
                    uprightVariant(variant) && agreement.seen(key, preview.candidates[0]?.score ?? 0, preview.named)
                        ? await confirmPreview(preview)
                        : null;
                if (outcome?.status === "recognised") {
                    agreement.reset();
                    variants.reset();
                    named = false;
                }

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
                        fromGuide: preview.fromGuide,
                        title: preview.title,
                        ocrError: preview.ocrError,
                        ocrModel: preview.ocrModel,
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
