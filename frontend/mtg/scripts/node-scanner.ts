//! What the Node tools share to embed cards and open an index exactly as the app does.
//!
//! The index builder and the harnesses all need the same three things: the reference cache, a
//! session over the chosen model, and an index that is checked against that model. Kept in one
//! place so a harness cannot measure one model against another model's index.
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import ort from "onnxruntime-node";
import type { RgbaImage } from "../src/scanner/card-detect";
import {
    DEFAULT_EMBEDDING_MODEL,
    EMBEDDING_MODELS,
    inputSize,
    isEmbeddingModel,
    poolOutput,
    prepareForModel,
} from "../src/scanner/embedding";
import type { EmbeddingModelSpec, Preprocessing } from "../src/scanner/embedding";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";
import type { EmbeddingIndex } from "../src/scanner/embedding-index";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Reads a `--flag value` pair from the command line
 *
 * @param flag
 * @param fallback returned when the flag is absent
 * @returns the value
 */
export function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * The reference cache: `faces.jsonl` and the `images/` it names.
 *
 * `--cache` or `SCAN_CACHE`, so a second checkout can read the 40 GB of images another one
 * already holds instead of downloading them again.
 *
 * @returns the directory
 */
export function cacheDir(): string {
    return option("--cache", process.env.SCAN_CACHE ?? join(root, ".cache", "scryfall"));
}

/**
 * Where raw vectors are written and read, `--embeddings` or `<cache>/embeddings`
 *
 * @returns the directory
 */
export function embeddingsDir(): string {
    return option("--embeddings", process.env.SCAN_EMBEDDINGS ?? join(cacheDir(), "embeddings"));
}

/**
 * The model a tool runs, from `--model`
 *
 * @returns the model's spec
 */
export function chosenModel(): EmbeddingModelSpec {
    const name = option("--model", DEFAULT_EMBEDDING_MODEL);
    if (!isEmbeddingModel(name)) {
        throw new Error(`Unbekanntes Modell "${name}", bekannt: ${Object.keys(EMBEDDING_MODELS).join(", ")}`);
    }
    return EMBEDDING_MODELS[name];
}

/**
 * The ONNX file a tool loads: `--model-file`, else the one the app serves
 *
 * @param spec the model
 * @returns the path
 */
export function modelFile(spec: EmbeddingModelSpec): string {
    return option("--model-file", join(root, "public", "models", spec.file));
}

/**
 * A model session in Node
 */
export type NodeEmbedder = {
    spec: EmbeddingModelSpec;
    preprocessing: Preprocessing;
    /** Base name of the ONNX file, which the index manifest records */
    file: string;
    /**
     * Embeds a batch of already prepared inputs
     *
     * @param inputs CHW planes from {@link prepareForModel}, null for an image that failed to load
     * @returns one vector per input
     */
    embedPrepared(inputs: (Float32Array | null)[]): Promise<Float32Array[]>;
    /**
     * Embeds one image
     *
     * @param image a rectified card or a reference scan
     * @returns its unit-length vector
     */
    embed(image: RgbaImage): Promise<Float32Array>;
};

/**
 * Opens a session over a model, preprocessing and pooling as the app does
 *
 * @param spec the model
 * @param path the ONNX file
 * @param threads intra-op threads
 * @param preprocessing which variant to prepare inputs with, the model's own by default
 * @param spinning whether idle threads busy-wait, which buys latency and costs throughput when
 *     several processes share the cores
 * @returns the embedder
 */
export async function createNodeEmbedder(
    spec: EmbeddingModelSpec,
    path: string,
    threads = 12,
    preprocessing: Preprocessing = spec.preprocessing,
    spinning = true,
): Promise<NodeEmbedder> {
    const session = await ort.InferenceSession.create(path, {
        intraOpNumThreads: threads,
        extra: { session: { intra_op: { allow_spinning: spinning ? "1" : "0" } } },
    });
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    const { width, height } = inputSize(preprocessing);
    const planes = 3 * width * height;

    const embedPrepared = async (inputs: (Float32Array | null)[]): Promise<Float32Array[]> => {
        const batch = new Float32Array(inputs.length * planes);
        inputs.forEach((input, item) => {
            if (input) batch.set(input, item * planes);
        });
        const output = await session.run({
            [inputName]: new ort.Tensor("float32", batch, [inputs.length, 3, height, width]),
        });
        const tensor = output[outputName];
        return poolOutput(spec, tensor.data as Float32Array, tensor.dims);
    };

    return {
        spec,
        preprocessing,
        file: basename(path),
        embedPrepared,
        embed: async (image) => (await embedPrepared([await prepareForModel(image, preprocessing)]))[0],
    };
}

/**
 * Opens a packed index from disk, refusing one that was built for a different embedder
 *
 * @param dir the index directory
 * @param embedder what the queries will come from
 * @returns the index
 */
export async function loadIndex(dir: string, embedder: NodeEmbedder): Promise<EmbeddingIndex> {
    return createEmbeddingIndex(
        {
            manifest: JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")),
            projection: (await readFile(join(dir, "projection.f32"))).buffer as ArrayBuffer,
            vectors: (await readFile(join(dir, "vectors.i8"))).buffer as ArrayBuffer,
            cards: JSON.parse(gunzipSync(await readFile(join(dir, "cards.json.gz"))).toString("utf8")),
        },
        { model: embedder.spec.id, preprocessing: embedder.preprocessing, modelFile: embedder.file },
    );
}

/**
 * The index a tool opens: `--index`, else the one the app serves for the model
 *
 * @param spec the model
 * @returns the directory
 */
export function indexDir(spec: EmbeddingModelSpec): string {
    return option("--index", join(root, "public", "data", spec.index));
}
