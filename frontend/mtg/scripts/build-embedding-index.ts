//! Embeds every reference card image and writes the raw vectors to disk.
//!
//! This is the expensive half of the index build, around 45 minutes for the full catalogue, so
//! it produces raw float32 vectors and nothing else. Projection, quantisation and packing live
//! in a separate step that runs in seconds against this output, which means the projection can
//! be retuned without paying for inference again.
//!
//! Preprocessing and pooling come from `src/scanner/embedding.ts`, the same module the app uses.
//! That is not tidiness: a reference vector and a query vector must be produced by identical
//! arithmetic, down to how the image is resampled to the model input, or the nearest neighbour
//! of a query stops being the right card. Decoding therefore stops at full-resolution RGBA and
//! the shared code does the rest.
//!
//! Resumable: vectors are appended in faces.jsonl order and a run continues behind whatever is
//! already on disk. Each model, preprocessing and model file gets its own vector file, so
//! building one never touches another's hours of inference.
//!
//! Usage: node scripts/build-embedding-index.mjs [--model dinov2-small|dhv-embed] [--model-file F]
//!            [--preprocessing P] [--tag T] [--cache DIR] [--embeddings DIR]
//!            [--batch 16] [--threads 12] [--limit N] [--shard k/n | --merge n]
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { prepareForModel } from "../src/scanner/embedding";
import type { Preprocessing } from "../src/scanner/embedding";
import type { RgbaImage } from "../src/scanner/card-detect";
import {
    cacheDir as chosenCache,
    chosenModel,
    createNodeEmbedder,
    embeddingsDir,
    modelFile,
    option,
} from "./node-scanner";

const cacheDir = chosenCache();
const facesPath = join(cacheDir, "faces.jsonl");
const outputDir = embeddingsDir();

/** How many batches are decoded ahead of inference. */
const DECODE_AHEAD = 3;

const batchSize = Number(option("--batch", "16"));
const threads = Number(option("--threads", "12"));
const limit = Number(option("--limit", "0"));

const spec = chosenModel();
const modelPath = modelFile(spec);
const variant = option("--preprocessing", spec.preprocessing) as Preprocessing;
const dim = spec.dim;

/** File-name part per preprocessing, kept as it was so existing vector files still resume. */
const SLUGS: Record<Preprocessing, string> = {
    area224: "plain",
    "clahe4+area224": "clahe4",
    bilinear448x320: "bilinear",
};

/**
 * Which file this variant's vectors land in.
 *
 * A model file other than the one the app serves gets its name in the tag, so measuring an
 * alternative export cannot overwrite the vectors of the shipped one.
 */
const tag = option(
    "--tag",
    basename(modelPath) === spec.file ? SLUGS[variant] : `${SLUGS[variant]}.${basename(modelPath, extname(modelPath))}`,
);
const vectorPath = join(outputDir, `${spec.id}.${tag}.f32`);
const metaPath = join(outputDir, `${spec.id}.${tag}.json`);

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

/**
 * Which slice of the catalogue this process embeds, from `--shard k/n`.
 *
 * One process does not keep 24 cores busy: the model scales poorly past a few intra-op threads.
 * Several processes over consecutive slices do, each writing its own part file, and `--merge n`
 * joins the parts in catalogue order once they are all complete.
 */
const shard = option("--shard", "");
const merge = Number(option("--merge", "0"));
if (shard) sharp.concurrency(Number(option("--decode-threads", "2")));

/**
 * Where a slice's vectors go, and which rows it covers
 *
 * @param k slice number, from 0
 * @param n number of slices
 * @param total rows in the catalogue
 * @returns the part file and its row range
 */
function slice(k: number, n: number, total: number): { path: string; from: number; to: number } {
    return {
        path: `${vectorPath}.shard${k}of${n}`,
        from: Math.floor((total * k) / n),
        to: Math.floor((total * (k + 1)) / n),
    };
}

/**
 * Writes the raw vectors' description beside them, which the packer turns into the manifest
 *
 * @param total vectors in the file
 * @param failed images that could not be read
 * @param file base name of the model file
 */
async function writeMeta(total: number, failed: number, file: string): Promise<void> {
    await writeFile(
        metaPath,
        JSON.stringify(
            {
                model: spec.id,
                modelFile: file,
                index: spec.index,
                pooling: spec.pooling,
                dim,
                count: total,
                failed,
                preprocessing: variant,
            },
            null,
            2,
        ),
    );
}

/**
 * Joins complete part files into the vector file, in catalogue order
 *
 * @param total rows in the catalogue
 */
async function mergeShards(total: number): Promise<void> {
    let failed = 0;
    const parts = Array.from({ length: merge }, (_, k) => slice(k, merge, total));
    for (const part of parts) {
        const size = (await stat(part.path).catch(() => null))?.size ?? 0;
        if (size !== (part.to - part.from) * dim * 4) {
            throw new Error(`${part.path} hat ${size / (dim * 4)} von ${part.to - part.from} Vektoren`);
        }
        failed += JSON.parse(await readFile(`${part.path}.json`, "utf8")).failed;
    }
    const sink = createWriteStream(vectorPath);
    for (const part of parts) {
        await new Promise<void>((resolve, reject) => {
            const source = createReadStream(part.path);
            source.on("error", reject);
            source.on("end", () => resolve());
            source.pipe(sink, { end: false });
        });
    }
    await new Promise<void>((resolve) => sink.end(() => resolve()));
    await writeMeta(total, failed, basename(modelPath));
    for (const part of parts) {
        await rm(part.path);
        await rm(`${part.path}.json`);
    }
    process.stderr.write(`Zusammengeführt: ${total} Vektoren à ${dim} in ${vectorPath}\n`);
}

async function main(): Promise<void> {
    await mkdir(outputDir, { recursive: true });
    const faces = await readFaces();
    const total = limit > 0 ? Math.min(limit, faces.length) : faces.length;
    if (merge > 0) {
        await mergeShards(total);
        return;
    }
    const [k, n] = shard ? shard.split("/").map(Number) : [0, 1];
    const part = shard ? slice(k, n, total) : { path: vectorPath, from: 0, to: total };
    const targetPath = part.path;

    // One writer at a time. Two builds against the same vector file do not merely race: each
    // truncates to the count *it* found at startup, so the slower one silently deletes the other's
    // work and leaves a file that looks complete. That cost two runs before this was here.
    const lockPath = `${targetPath}.lock`;
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

    const rows = part.to - part.from;
    const existing = await stat(targetPath).catch(() => null);
    const done = existing ? Math.floor(existing.size / (dim * 4)) : 0;
    if (done >= rows) {
        process.stderr.write(`Bereits vollständig: ${done} Vektoren\n`);
        await release();
        return;
    }
    if (done > 0) process.stderr.write(`Setze bei Vektor ${part.from + done} fort\n`);

    const handle = await open(targetPath, done > 0 ? "r+" : "w");
    await handle.truncate(done * dim * 4);
    const sink = createWriteStream("", { fd: handle.fd, start: done * dim * 4, autoClose: false });

    const embedder = await createNodeEmbedder(spec, modelPath, threads, variant, !shard);
    process.stderr.write(`${spec.id} aus ${modelPath}, ${variant}, nach ${targetPath}\n`);

    const write = (buffer: Buffer): Promise<void> =>
        sink.write(buffer) ? Promise.resolve() : new Promise((resolve) => sink.once("drain", () => resolve()));

    const started = Date.now();
    let processed = 0;
    let failed = 0;

    const batchStarts: number[] = [];
    for (let start = part.from + done; start < part.to; start += batchSize) batchStarts.push(start);

    const decodeBatch = (start: number) =>
        Promise.all(
            faces.slice(start, Math.min(start + batchSize, part.to)).map((file) => decode(join(cacheDir, file))),
        );

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
        failed += decoded.filter((input) => input === null).length;
        const vectors = await embedder.embedPrepared(decoded);

        const buffer = Buffer.allocUnsafe(count * dim * 4);
        for (let item = 0; item < count; item += 1) {
            Buffer.from(vectors[item].buffer, vectors[item].byteOffset, dim * 4).copy(buffer, item * dim * 4);
        }
        await write(buffer);

        processed += count;
        if (index % 20 === 0 || index === batchStarts.length - 1) {
            const elapsed = (Date.now() - started) / 1000;
            const rate = processed / Math.max(elapsed, 1);
            const left = rate > 0 ? Math.round((rows - done - processed) / rate) : 0;
            process.stderr.write(
                `\r${part.from + done + processed}/${part.to}  ${rate.toFixed(1)}/s  ` +
                    `${(1000 / rate).toFixed(1)} ms/bild  noch ~${Math.floor(left / 60)} min  fehler ${failed}   `,
            );
        }
    }

    await new Promise<void>((resolve) => sink.end(() => resolve()));
    await handle.close();
    process.stderr.write("\n");

    if (shard) {
        const previous = await readFile(`${targetPath}.json`, "utf8").catch(() => "");
        const before = previous ? JSON.parse(previous).failed : 0;
        await writeFile(`${targetPath}.json`, JSON.stringify({ ...part, failed: before + failed }));
    } else {
        await writeMeta(rows, failed, embedder.file);
    }
    await release();
    process.stderr.write(`Fertig. ${rows} Vektoren à ${dim} in ${targetPath}\n`);
}

await main();
