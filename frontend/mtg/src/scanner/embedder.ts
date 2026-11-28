//! Runs the embedding model in the browser.
//!
//! The counterpart to what the index builder does in Node. Both call the same preprocessing and
//! pooling; only the inference backend differs, and that difference is confined to this file.
//!
//! WebGPU is preferred and the WASM build is the fallback, in that order, because the model is
//! run several times per scan and the difference is the difference between a scanner that feels
//! instant and one that does not. Which one was chosen is reported, since it is the first thing
//! worth knowing when a device turns out to be slow.
import type * as Ort from "onnxruntime-web/webgpu";
import { conservativeScanner } from "./runtime-policy";
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS, inputSize, poolOutput, prepareForModel } from "./embedding";
import type { EmbeddingModel } from "./embedding";
import type { RgbaImage } from "./card-detect";
import { probeWebGpu } from "./webgpu-probe";
import type { WebgpuStrategy } from "./webgpu-strategy";

/**
 * A loaded embedder plus which backend it ended up on
 */
export type Embedder = {
    /** Which model this is, which decides the index it can be searched against */
    model: EmbeddingModel;
    backend: "webgpu" | "wasm";
    /** Version of the inference runtime, which is what a verdict about a backend is tied to */
    runtime: string;
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

const pending = new Map<EmbeddingModel, Promise<Embedder>>();

/**
 * Loads a model once, preferring WebGPU.
 *
 * DINOv2's full-precision export is served despite being twice the download of its half-precision
 * one: that export fails during graph initialisation, in the browser and in Node alike, on a
 * fusion that refers to a tensor its own graph does not contain.
 *
 * @param onProgress receives a short status while loading
 * @param strategy which WebGPU arrangement to try this time, from what the last run learned
 * @param model which model to load
 * @returns the embedder
 */
export async function loadEmbedder(
    onProgress?: (status: string) => void,
    strategy: WebgpuStrategy = "full",
    model: EmbeddingModel = DEFAULT_EMBEDDING_MODEL,
): Promise<Embedder> {
    const spec = EMBEDDING_MODELS[model];
    const modelPath = `/models/${spec.file}`;
    const { width, height } = inputSize(spec.preprocessing);
    const loading = pending.get(model);
    if (loading) return loading;
    const started = (async () => {
        const conservative = conservativeScanner();
        // Selecting the WASM provider from the WebGPU bundle still compiles JSEP.
        // Import the plain runtime instead so WebKit never initialises that module.
        const ort = conservative ? await import("onnxruntime-web/wasm") : await import("onnxruntime-web/webgpu");
        if (conservative) strategy = "off";
        // Threads need SharedArrayBuffer, which needs the page to be cross-origin isolated. The
        // deployment and dev server send those headers. Older cached pages and browsers without
        // isolation still use one thread.
        ort.env.wasm.numThreads =
            !conservative && self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

        /**
         * Reads a result tensor, wherever it ended up.
         *
         * The download comes first, and that ordering is the whole point. On WebGPU the values
         * live on the device and the synchronous getter hands back a buffer of the right length
         * filled with zeros rather than nothing at all, so a check for "is there data" passes and
         * the zeros go downstream. A zero vector is the worst possible answer here: it matches
         * every row of the index equally, so the scanner names whichever card happens to be first.
         * That is what made WebGPU look broken.
         *
         * @param tensor
         * @returns the values
         */
        const readTensor = async (tensor: Ort.Tensor): Promise<Float32Array> => {
            if (typeof tensor.getData === "function") {
                return (await tensor.getData(true)) as Float32Array;
            }
            return tensor.data as Float32Array;
        };

        /**
         * Runs one input through a session and pools it
         *
         * @param target
         * @param input
         * @returns the pooled vector
         */
        const runOnce = async (target: Ort.InferenceSession, input: Float32Array): Promise<Float32Array> => {
            const output = await target.run({
                [target.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, height, width]),
            });
            const result = output[target.outputNames[0]];
            return poolOutput(spec, await readTensor(result), result.dims)[0];
        };

        /**
         * Whether a vector is the unit-length embedding everything downstream assumes
         *
         * @param vector
         * @returns whether it is usable
         */
        const usable = (vector: Float32Array): string => {
            if (vector.length !== spec.dim) return `${vector.length} statt ${spec.dim} Werten`;
            let norm = 0;
            for (const value of vector) norm += value * value;
            if (!Number.isFinite(norm)) return "nicht endliche Werte";
            const length = Math.sqrt(norm);
            // Naming the length rather than just refusing: zero means the values never came back
            // from the device, anything else means the model computed something wrong, and those
            // are different bugs.
            return Math.abs(length - 1) < 0.01 ? "" : `Länge ${length.toFixed(3)} statt 1`;
        };

        /**
         * A varied input for the probe, spanning what a real card actually produces.
         *
         * Not a constant fill: a backend that quietly returns its input, or zeros, would look
         * plausible against a flat picture, and the point of the probe is to catch exactly that.
         *
         * The range matters as much as the variation. An earlier version of this swung by half a
         * unit, and a backend passed it and then returned infinities on the first real card:
         * after the ImageNet normalisation this model expects, a picture spans roughly -2.1 to
         * 2.6, five times wider, and whatever overflows does so somewhere in between. A probe
         * that does not reach where the model works is not a probe.
         *
         * @returns model input
         */
        const probeInput = (): Float32Array => {
            const input = new Float32Array(3 * width * height);
            for (let index = 0; index < input.length; index += 1) {
                input[index] = 0.25 + 2.4 * Math.sin(index * 0.017) * Math.cos(index * 0.0031);
            }
            return input;
        };

        /**
         * The backends to try, best first.
         *
         * WebGPU appears twice because it fails here in a way worth working around. On an ARM
         * Mali gen-5 phone it loaded, ran, and returned values that were not finite. Two compute
         * shaders of our own (see `webgpu-probe.ts`) settled where the fault is *not*: that
         * device computes both single and half precision correctly, `sqrt` and `exp` included,
         * so neither the browser nor the driver is broken in general, and what is left is the
         * inference library's own kernels.
         *
         * What that adapter also advertises is `subgroups`, which those kernels use for fast
         * reductions in matmul and softmax. A reduction that goes wrong there produces exactly
         * this: infinities that depend on the data rather than on the settings, which is why
         * giving up the graph fusions one level at a time changed nothing at all.
         *
         * So the retries hide features instead. They are separated rather than combined so that
         * a success also says which feature was at fault, which is the difference between a bug
         * report someone can act on and one more "does not work on my phone".
         *
         * Each attempt still has to pass the probe, so a setting that merely fails differently
         * cannot sneak through.
         */
        const attempts: { provider: Embedder["backend"] }[] =
            strategy === "off" ? [{ provider: "wasm" }] : [{ provider: "webgpu" }, { provider: "wasm" }];

        /**
         * Hands the library an adapter that advertises fewer features.
         *
         * `env.webgpu.adapter` is the documented way in, and its documented condition is the whole
         * reason this exists in this shape: it is only read *before the first WebGPU session is
         * initialized*. An earlier version of this tried the plain adapter first and narrowed ones
         * afterwards, which cannot work — by then the provider is already up, and the retries were
         * measuring nothing. Which narrowing to use is therefore decided before the first attempt,
         * from what the last run learned, and one page load tests exactly one of them.
         *
         * There is no way to build an adapter without features, so the real one is wrapped: it
         * reports the narrowed set and strips those features from any device it is asked to make.
         *
         * @param hidden feature names to withhold
         */
        const narrowAdapter = async (hidden: string[]): Promise<void> => {
            const adapter = await navigator.gpu?.requestAdapter();
            if (!adapter) throw new Error("kein Adapter");
            const withheld = new Set(hidden);
            const features = new Set([...adapter.features].filter((name) => !withheld.has(name)));
            ort.env.webgpu.adapter = new Proxy(adapter, {
                /**
                 * Answers for the adapter, minus the withheld features
                 *
                 * @param target the real adapter
                 * @param property what was asked for
                 * @returns the real value, or a narrowed one
                 */
                get(target, property) {
                    if (property === "features") return features;
                    if (property === "requestDevice") {
                        return (descriptor?: GPUDeviceDescriptor) =>
                            target.requestDevice({
                                ...descriptor,
                                requiredFeatures: [...(descriptor?.requiredFeatures ?? [])].filter(
                                    (name) => !withheld.has(name),
                                ),
                            });
                    }
                    const value = Reflect.get(target, property, target);
                    return typeof value === "function" ? value.bind(target) : value;
                },
            }) as never;
        };

        let session: Ort.InferenceSession | null = null;
        let backend: Embedder["backend"] = "wasm";
        // Every attempt's reason is kept and reported. Swallowing them and raising one generic
        // sentence turns a five-minute diagnosis into a guessing game, and the backends fail
        // for entirely different reasons.
        const reasons: string[] = [];
        reasons.push(`wasm: ${ort.env.wasm.numThreads} threads · isolated: ${self.crossOriginIsolated === true}`);
        // A backend that threw while loading is not worth a second look this run.
        const dead = new Set<Embedder["backend"]>();
        if (conservative) reasons.push("webgpu: WebKit-Schutzmodus, reine WASM-Runtime ohne JSEP");
        else if (strategy === "off") reasons.push("webgpu: hier schon gescheitert, übersprungen");
        if (strategy !== "off" && strategy !== "full") {
            try {
                await narrowAdapter(strategy === "no-subgroups" ? ["subgroups"] : ["subgroups", "shader-f16"]);
                reasons.push(`webgpu: Adapter ohne ${strategy === "no-subgroups" ? "subgroups" : "subgroups+f16"}`);
            } catch (error) {
                reasons.push(`webgpu: Adapter nicht einschränkbar (${String(error)})`);
            }
        }
        for (const attempt of attempts) {
            if (dead.has(attempt.provider)) continue;
            const label = attempt.provider === "webgpu" ? `webgpu/${strategy}` : attempt.provider;
            let candidate: Ort.InferenceSession | null = null;
            try {
                onProgress?.(label);
                candidate = await ort.InferenceSession.create(modelPath, {
                    executionProviders: [attempt.provider],
                    // Say where the results belong rather than relying on the default. Left to
                    // itself the WebGPU backend may keep them on the device.
                    preferredOutputLocation: "cpu",
                });

                // A backend that loads is not yet a backend that works. WebGPU accepts this model
                // and can still hand back nothing usable, and a zero vector matches every row of
                // the index equally well, so the scanner would confidently report whichever card
                // happens to be first. One run with a known input settles it before any of that.
                onProgress?.(label);
                const probe = await runOnce(candidate, probeInput());
                const wrong = usable(probe);
                if (wrong) {
                    reasons.push(`${label}: Ausgabe unbrauchbar (${wrong})`);
                    continue;
                }

                session = candidate;
                backend = attempt.provider;
                if (attempt.provider === "webgpu" && strategy !== "full") reasons.push(`${label}: benutzt`);
                break;
            } catch (error) {
                reasons.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
                dead.add(attempt.provider);
                session = null;
            } finally {
                if (candidate && candidate !== session) await candidate.release().catch(() => undefined);
            }
        }
        // Only when the fast path was refused, and only then: it costs a device and two shaders,
        // and there is nothing to explain when WebGPU worked.
        if (backend !== "webgpu" && !conservative) {
            const gpu = await probeWebGpu();
            if (!gpu) reasons.push("webgpu: navigator.gpu fehlt");
            else {
                reasons.push(`gpu adapter: ${gpu.adapter}`);
                reasons.push(`gpu f32: ${gpu.f32} · f16: ${gpu.f16}`);
                reasons.push(`gpu features: ${gpu.features.join(", ") || "keine"}`);
            }
        }

        if (!session) throw new Error(`Modell konnte nicht geladen werden. ${reasons.join(" | ")}`);

        let current = session;

        const embedder: Embedder = {
            model,
            backend,
            runtime: ort.env.versions.web ?? ort.env.versions.common,
            notes: reasons,
            /**
             * Embeds one rectified card
             *
             * @param image
             * @returns the pooled, unit-length vector
             */
            async embed(image: RgbaImage): Promise<Float32Array> {
                const input = await prepareForModel(image, spec.preprocessing);
                let wrong: string;
                try {
                    const vector = await runOnce(current, input);
                    wrong = usable(vector);
                    if (!wrong) return vector;
                } catch (error) {
                    if (backend === "wasm") throw error;
                    wrong = error instanceof Error ? error.message : String(error);
                }

                // A backend that passed the probe can still fail on a real card, and this one
                // does: the same phone accepted WebGPU at load and returned infinities on the
                // first photograph. Throwing here would end the scan for the rest of the session
                // over a fault that has a working alternative, so the fast path is given up once
                // and the slow one takes over. Once only: if WASM produces this too, the fault is
                // not the backend and hiding it would be worse than stopping.
                if (backend === "wasm") throw new Error(`Modellausgabe unbrauchbar (wasm, ${wrong})`);

                reasons.push(`webgpu: im Betrieb ausgefallen (${wrong}), weiter auf wasm`);
                const replacement = await ort.InferenceSession.create(modelPath, {
                    executionProviders: ["wasm"],
                    preferredOutputLocation: "cpu",
                });
                await current.release().catch(() => undefined);
                current = replacement;
                backend = "wasm";
                embedder.backend = "wasm";

                const retried = await runOnce(current, input);
                const stillWrong = usable(retried);
                if (stillWrong) throw new Error(`Modellausgabe unbrauchbar (wasm, ${stillWrong})`);
                return retried;
            },
        };
        return embedder;
    })();
    pending.set(model, started);
    return started;
}
