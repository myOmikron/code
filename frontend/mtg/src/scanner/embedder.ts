//! Runs the embedding model in the browser.
//!
//! The counterpart to what the index builder does in Node. Both call the same preprocessing and
//! pooling; only the inference backend differs, and that difference is confined to this file.
//!
//! WebGPU is preferred and the WASM build is the fallback, in that order, because the model is
//! run several times per scan and the difference is the difference between a scanner that feels
//! instant and one that does not. Which one was chosen is reported, since it is the first thing
//! worth knowing when a device turns out to be slow.
import * as ort from "onnxruntime-web";
import { EMBEDDING_DIM, IMAGE_SIZE, poolHidden, prepareForModel } from "./embedding";
import type { RgbaImage } from "./card-detect";

/**
 * The exported model.
 *
 * Full precision, despite being twice the download of the half-precision export: that export is
 * broken. It fails during graph initialisation, in the browser and in Node alike, on a fusion
 * that refers to a tensor its own graph does not contain. Size is worth a lot here, but not a
 * model that cannot load.
 */
const MODEL_PATH = "/models/dinov2-small.onnx";

/**
 * A loaded embedder plus which backend it ended up on
 */
export type Embedder = {
    backend: "webgpu" | "wasm";
    /** Why any faster backend was passed over, in the order they were tried */
    notes: string[];
    /**
     * Embeds one rectified card
     *
     * @param image a rectified card
     * @returns the pooled, unit-length vector
     */
    embed(image: RgbaImage): Promise<Float32Array>;
};

let pending: Promise<Embedder> | null = null;

/**
 * Loads the model once, preferring WebGPU.
 *
 * @param onProgress receives a short status while loading
 * @returns the embedder
 */
export async function loadEmbedder(onProgress?: (status: string) => void): Promise<Embedder> {
    pending ??= (async () => {
        // Threads need SharedArrayBuffer, which needs the page to be cross-origin isolated. The
        // dev server does not send those headers, so asking for threads there fails rather than
        // degrades. One thread always works, and WebGPU makes the question moot where it runs.
        ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

        /**
         * Reads a result tensor, wherever it ended up.
         *
         * On WebGPU the data may still live on the device, where the synchronous getter has
         * nothing to hand back.
         *
         * @param tensor
         * @returns the values
         */
        const readTensor = async (tensor: ort.Tensor): Promise<Float32Array> => {
            const direct = tensor.data as Float32Array | undefined;
            if (direct && direct.length > 0) return direct;
            return (await tensor.getData(true)) as Float32Array;
        };

        /**
         * Runs one input through a session and pools it
         *
         * @param target
         * @param input
         * @returns the pooled vector
         */
        const runOnce = async (target: ort.InferenceSession, input: Float32Array): Promise<Float32Array> => {
            const output = await target.run({
                [target.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
            });
            const hidden = output[target.outputNames[0]];
            return poolHidden(await readTensor(hidden), 1, hidden.dims[1] as number)[0];
        };

        /**
         * Whether a vector is the unit-length embedding everything downstream assumes
         *
         * @param vector
         * @returns whether it is usable
         */
        const usable = (vector: Float32Array): boolean => {
            if (vector.length !== EMBEDDING_DIM) return false;
            let norm = 0;
            for (const value of vector) norm += value * value;
            return Number.isFinite(norm) && Math.abs(Math.sqrt(norm) - 1) < 0.01;
        };

        let session: ort.InferenceSession | null = null;
        let backend: Embedder["backend"] = "wasm";
        // Every attempt's reason is kept and reported. Swallowing them and raising one generic
        // sentence turns a five-minute diagnosis into a guessing game, and the two backends fail
        // for entirely different reasons.
        const reasons: string[] = [];
        for (const provider of ["webgpu", "wasm"] as const) {
            try {
                onProgress?.(`Modell wird geladen (${provider})`);
                const candidate = await ort.InferenceSession.create(MODEL_PATH, { executionProviders: [provider] });

                // A backend that loads is not yet a backend that works. WebGPU accepts this model
                // and can still hand back nothing usable, and a zero vector matches every row of
                // the index equally well, so the scanner would confidently report whichever card
                // happens to be first. One run with a known input settles it before any of that.
                onProgress?.(`Backend wird geprüft (${provider})`);
                const probe = await runOnce(candidate, new Float32Array(3 * IMAGE_SIZE * IMAGE_SIZE).fill(0.2));
                if (!usable(probe)) {
                    reasons.push(`${provider}: Ausgabe unbrauchbar`);
                    await candidate.release();
                    continue;
                }

                session = candidate;
                backend = provider;
                break;
            } catch (error) {
                reasons.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
                session = null;
            }
        }
        if (!session) throw new Error(`Modell konnte nicht geladen werden. ${reasons.join(" | ")}`);

        const ready = session;

        return {
            backend,
            notes: reasons,
            /**
             *
             * @param image
             */
            /**
             * Embeds one rectified card
             *
             * @param image
             * @returns the pooled, unit-length vector
             */
            async embed(image: RgbaImage): Promise<Float32Array> {
                const vector = await runOnce(ready, await prepareForModel(image));
                if (!usable(vector)) throw new Error(`Modellausgabe unbrauchbar (${backend})`);
                return vector;
            },
        };
    })();
    return pending;
}
