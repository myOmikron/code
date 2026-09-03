//! Embeds every reference card image and writes the raw vectors to disk.
//!
//! This is the expensive half of the index build, around 45 minutes for the full catalogue, so
//! it produces raw float32 vectors and nothing else. Projection, quantisation and packing live
//! in a separate step that runs in seconds against this output, which means the projection can
//! be retuned without paying for inference again.
//!
//! Preprocessing and pooling come from `src/scanner/embedding.ts`, the same module the app uses.
//! That is not tidiness: a reference vector and a query vector must be produced by identical
//! arithmetic, down to how the image is resampled to 224×224, or the nearest neighbour of a
//! query stops being the right card. Decoding therefore stops at full-resolution RGBA and the
//! shared code does the rest.
//!
//! Resumable: vectors are appended in faces.jsonl order and a run continues behind whatever is
//! already on disk.
//!
//! Usage: node scripts/build-embedding-index.mjs [--batch 16] [--threads 12] [--limit N]
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { EMBEDDING_DIM, IMAGE_SIZE, poolHidden, PREPROCESSING, prepareForModel } from "../src/scanner/embedding";
import type { Preprocessing } from "../src/scanner/embedding";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");
const modelPath = join(here, "..", ".cache", "models", "model.onnx");
const facesPath = join(cacheDir, "faces.jsonl");
const outputDir = join(cacheDir, "embeddings");

/** How many batches are decoded ahead of inference. */
const DECODE_AHEAD = 3;

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const batchSize = Number(option("--batch", "16"));
const threads = Number(option("--threads", "12"));
const limit = Number(option("--limit", "0"));

/**
 * Which preprocessing to build with, and where that variant's vectors land.
 *
 * Each variant gets its own file so comparing two of them does not destroy the other side's hour
 * of inference.
 */
const variant = option("--preprocessing", PREPROCESSING) as Preprocessing;
const slug = variant === "clahe4+area224" ? "clahe4" : "plain";
const vectorPath = join(outputDir, `dinov2-small.${slug}.f32`);
const metaPath = join(outputDir, `dinov2-small.${slug}.json`);

/**
 * Reads the image path of every face. Identity stays in the file; only order matters here.
 *
 * @returns one relative image path per face
 */
async function readFaces(): Promise<string[]> {
    const lines = createInterface({ input: createReadStream(facesPath), crlfDelay: Infinity });
    const faces: string[] = [];
    for await (const line of lines) {
        if (line) faces.push(JSON.parse(line).image);
    }
    return faces;
}

/**
 * Decodes one reference image to full-resolution RGBA and hands it to the shared preprocessing
 *
 * @param path
 * @returns model input, or null if the file cannot be read
 */
async function decode(path: string): Promise<Float32Array | null> {
    try {
        const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const image: RgbaImage = {
            data: new Uint8ClampedArray(data),
            width: info.width,
            height: info.height,
        };
        return prepareForModel(image, variant);
    } catch {
        return null;
    }
}

async function main(): Promise<void> {
    await mkdir(outputDir, { recursive: true });

    // One writer at a time. Two builds against the same vector file do not merely race: each
    // truncates to the count *it* found at startup, so the slower one silently deletes the other's
    // work and leaves a file that looks complete. That cost two runs before this was here.
    const lockPath = `${vectorPath}.lock`;
    const lock = await open(lockPath, "wx").catch(() => null);
    if (!lock) {
        throw new Error(`${lockPath} existiert — läuft schon ein Bau? Sonst die Datei löschen.`);
    }
    await lock.write(`${process.pid}\n`);
    const release = async () => {
        await lock.close().catch(() => undefined);
        await rm(lockPath, { force: true }).catch(() => undefined);
    };
    process.on("exit", () => {
        try {
            unlinkSync(lockPath);
        } catch {
            // already gone
        }
    });
    const faces = await readFaces();
    const total = limit > 0 ? Math.min(limit, faces.length) : faces.length;

    const existing = await stat(vectorPath).catch(() => null);
    const done = existing ? Math.floor(existing.size / (EMBEDDING_DIM * 4)) : 0;
    if (done >= total) {
        process.stderr.write(`Bereits vollständig: ${done} Vektoren\n`);
        await release();
        return;
    }
    if (done > 0) process.stderr.write(`Setze bei Vektor ${done} fort\n`);

    const handle = await open(vectorPath, done > 0 ? "r+" : "w");
    await handle.truncate(done * EMBEDDING_DIM * 4);
    const sink = createWriteStream("", { fd: handle.fd, start: done * EMBEDDING_DIM * 4, autoClose: false });

    const session = await ort.InferenceSession.create(modelPath, { intraOpNumThreads: threads });
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const write = (buffer: Buffer): Promise<void> =>
        sink.write(buffer) ? Promise.resolve() : new Promise((resolve) => sink.once("drain", () => resolve()));

    const started = Date.now();
    let processed = 0;
    let failed = 0;

    const batchStarts: number[] = [];
    for (let start = done; start < total; start += batchSize) batchStarts.push(start);

    const decodeBatch = (start: number) =>
        Promise.all(faces.slice(start, Math.min(start + batchSize, total)).map((file) => decode(join(cacheDir, file))));

    const pending = new Map<number, Promise<(Float32Array | null)[]>>();
    for (let index = 0; index < Math.min(DECODE_AHEAD, batchStarts.length); index += 1) {
        pending.set(batchStarts[index], decodeBatch(batchStarts[index]));
    }

    for (const [index, start] of batchStarts.entries()) {
        const decoded = await pending.get(start)!;
        pending.delete(start);
        const ahead = batchStarts[index + DECODE_AHEAD];
        if (ahead !== undefined) pending.set(ahead, decodeBatch(ahead));

        const count = decoded.length;
        const input = new Float32Array(count * 3 * IMAGE_SIZE * IMAGE_SIZE);
        for (let item = 0; item < count; item += 1) {
            const chw = decoded[item];
            if (chw) input.set(chw, item * 3 * IMAGE_SIZE * IMAGE_SIZE);
            else failed += 1;
        }

        const output = await session.run({
            [inputName]: new ort.Tensor("float32", input, [count, 3, IMAGE_SIZE, IMAGE_SIZE]),
        });
        const tensor = output[outputName];
        const vectors = poolHidden(tensor.data as Float32Array, count, tensor.dims[1] as number);

        const buffer = Buffer.allocUnsafe(count * EMBEDDING_DIM * 4);
        for (let item = 0; item < count; item += 1) {
            Buffer.from(vectors[item].buffer, vectors[item].byteOffset, EMBEDDING_DIM * 4).copy(
                buffer,
                item * EMBEDDING_DIM * 4,
            );
        }
        await write(buffer);

        processed += count;
        if (index % 20 === 0 || index === batchStarts.length - 1) {
            const elapsed = (Date.now() - started) / 1000;
            const rate = processed / Math.max(elapsed, 1);
            const left = rate > 0 ? Math.round((total - done - processed) / rate) : 0;
            process.stderr.write(
                `\r${done + processed}/${total}  ${rate.toFixed(1)}/s  ` +
                    `${(1000 / rate).toFixed(1)} ms/bild  noch ~${Math.floor(left / 60)} min  fehler ${failed}   `,
            );
        }
    }

    await new Promise<void>((resolve) => sink.end(() => resolve()));
    await handle.close();
    process.stderr.write("\n");

    await writeFile(
        metaPath,
        JSON.stringify(
            {
                model: "dinov2-small",
                pooling: "cls+patchmean",
                dim: EMBEDDING_DIM,
                count: total,
                failed,
                imageSize: IMAGE_SIZE,
                preprocessing: variant,
            },
            null,
            2,
        ),
    );
    await release();
    process.stderr.write(`Fertig. ${total} Vektoren à ${EMBEDDING_DIM} in ${vectorPath}\n`);
}

await main();
