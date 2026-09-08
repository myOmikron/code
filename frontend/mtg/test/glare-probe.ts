//! Tests whether local contrast equalisation closes the gap that glare opens.
//!
//! A reflection across a card flattens it: the model then sees something closer to any other
//! washed-out picture than to the card's own reference scan. CLAHE restores local contrast
//! without amplifying the reflection itself, which is what plain histogram equalisation would do.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { IMAGE_SIZE, poolHidden, preprocess } from "../src/scanner/embedding";
import { loadOpenCv, withMats } from "../src/scanner/opencv";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");
const [cropPath] = process.argv.slice(2);

const cv = await loadOpenCv();
const session = await ort.InferenceSession.create(join(here, "..", ".cache", "models", "model.onnx"), {
    intraOpNumThreads: 12,
});

async function read(path: string): Promise<RgbaImage> {
    const { data, info } = await sharp(path).resize(488, 680, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * Equalises local contrast on the lightness channel, leaving colour alone
 *
 * @param image
 * @param clip how hard the equalisation is limited
 * @returns the equalised copy
 */
function equalise(image: RgbaImage, clip: number): RgbaImage {
    return withMats((track) => {
        const rgba = track(cv.matFromImageData(image));
        const lab = track(new cv.Mat());
        cv.cvtColor(rgba, lab, cv.COLOR_RGB2Lab);
        const channels = track(new cv.MatVector());
        cv.split(lab, channels);
        const lightness = track(channels.get(0));
        const clahe = track(new cv.CLAHE(clip, new cv.Size(8, 8)));
        clahe.apply(lightness, lightness);
        channels.set(0, lightness);
        cv.merge(channels, lab);
        const out = track(new cv.Mat());
        cv.cvtColor(lab, out, cv.COLOR_Lab2RGB);
        const rgbaOut = track(new cv.Mat());
        cv.cvtColor(out, rgbaOut, cv.COLOR_RGB2RGBA);
        return { data: new Uint8ClampedArray(rgbaOut.data), width: image.width, height: image.height };
    });
}

async function embed(image: RgbaImage): Promise<Float32Array> {
    const output = await session.run({
        [session.inputNames[0]]: new ort.Tensor("float32", preprocess(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
    });
    const tensor = output[session.outputNames[0]];
    return poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];
}

const dot = (a: Float32Array, b: Float32Array) => a.reduce((sum, value, index) => sum + value * b[index], 0);

const faces: { image: string; name: string; set: string; collectorNumber: string }[] = [];
const lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
for await (const line of lines) if (line) faces.push(JSON.parse(line));

const target = faces.find((f) => f.set === "hob" && f.collectorNumber === "170")!;
const distractor = faces.find((f) => f.set === "unk" && f.collectorNumber === "RZ05a")!;

const crop = await read(cropPath);
const reference = await read(join(cacheDir, target.image));
const wrong = await read(join(cacheDir, distractor.image));

for (const clip of [0, 2, 3, 4]) {
    const apply = (image: RgbaImage) => (clip === 0 ? image : equalise(image, clip));
    const q = await embed(apply(crop));
    const r = await embed(apply(reference));
    const w = await embed(apply(wrong));
    console.log(
        `clip ${clip === 0 ? "aus " : String(clip).padEnd(4)}  richtig ${dot(q, r).toFixed(4)}   falsch ${dot(q, w).toFixed(4)}   ` +
            `Abstand ${(dot(q, r) - dot(q, w)).toFixed(4)}`,
    );
}
