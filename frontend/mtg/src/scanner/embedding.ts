//! Shared preprocessing and pooling for the card embedding.
//!
//! The reference index and a live scan must go through byte-identical arithmetic, otherwise the
//! query lands in a slightly different space than the vectors it is compared against and the
//! nearest neighbour stops being the right card. Both sides therefore call the functions here;
//! only the inference backend differs (onnxruntime-node when building the index,
//! onnxruntime-web in the app).
import type { RgbaImage } from "./card-detect";
import type { EmbeddingModelSpec, Preprocessing } from "./embedding-models";
import { equaliseLocalContrast } from "./image-quality";

export { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS, isEmbeddingModel } from "./embedding-models";
export type { EmbeddingModel, EmbeddingModelSpec, Preprocessing } from "./embedding-models";

/**
 * The variant the shipped index is built with.
 *
 * Written into the index manifest and checked when it is loaded. Query and index have to go
 * through identical arithmetic, and a mismatch does not fail loudly, it just quietly returns the
 * wrong card. A version string is the cheapest way to make that impossible.
 */
export const PREPROCESSING: Preprocessing = "area224";

/** Input geometry the model was exported with. */
export const IMAGE_SIZE = 224;
/** Width of one token in the model's hidden state. */
export const HIDDEN_DIM = 384;
/** Length of a pooled vector: CLS token followed by the patch-token mean. */
export const EMBEDDING_DIM = HIDDEN_DIM * 2;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * The model input geometry a preprocessing variant produces
 *
 * @param variant
 * @returns width and height of the CHW planes
 */
export function inputSize(variant: Preprocessing): { width: number; height: number } {
    return variant === "bilinear448x320" ? { width: 320, height: 448 } : { width: IMAGE_SIZE, height: IMAGE_SIZE };
}

/**
 * Resizes an RGBA image bilinearly and normalizes it into CHW float planes.
 *
 * Follows OpenCV's `INTER_LINEAR`, which is what dhv-embed was trained with (albumentations
 * `Resize`): pixel centres are aligned, the two nearest source pixels per axis are blended, and
 * the result is rounded to 8 bit before the ImageNet normalisation, as the uint8 training images
 * were. The card is stretched to the target size, like the training warps.
 *
 * @param image any RGBA buffer, typically a rectified card
 * @param width target width
 * @param height target height
 * @returns normalized CHW floats, ready as model input
 */
export function preprocessBilinear(image: RgbaImage, width: number, height: number): Float32Array {
    const { data, width: sourceWidth, height: sourceHeight } = image;
    const pixels = width * height;
    const output = new Float32Array(3 * pixels);
    const scaleX = sourceWidth / width;
    const scaleY = sourceHeight / height;

    const columns = new Int32Array(width * 2);
    const columnWeights = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
        const source = Math.max(0, (x + 0.5) * scaleX - 0.5);
        const left = Math.min(Math.floor(source), sourceWidth - 1);
        columns[x * 2] = left;
        columns[x * 2 + 1] = Math.min(left + 1, sourceWidth - 1);
        columnWeights[x] = source - left;
    }

    for (let y = 0; y < height; y += 1) {
        const source = Math.max(0, (y + 0.5) * scaleY - 0.5);
        const top = Math.min(Math.floor(source), sourceHeight - 1);
        const bottom = Math.min(top + 1, sourceHeight - 1);
        const down = source - top;
        for (let x = 0; x < width; x += 1) {
            const right = columnWeights[x];
            const topLeft = (top * sourceWidth + columns[x * 2]) * 4;
            const topRight = (top * sourceWidth + columns[x * 2 + 1]) * 4;
            const bottomLeft = (bottom * sourceWidth + columns[x * 2]) * 4;
            const bottomRight = (bottom * sourceWidth + columns[x * 2 + 1]) * 4;
            const target = y * width + x;
            for (let channel = 0; channel < 3; channel += 1) {
                const upper = data[topLeft + channel] * (1 - right) + data[topRight + channel] * right;
                const lower = data[bottomLeft + channel] * (1 - right) + data[bottomRight + channel] * right;
                const value = Math.round(upper * (1 - down) + lower * down);
                output[channel * pixels + target] = (value / 255 - MEAN[channel]) / STD[channel];
            }
        }
    }
    return output;
}

/**
 * Removes a global colour cast by scaling each channel to the image's overall mean.
 *
 * Reference scans are colour neutral; a photo carries whatever the room's light and the phone's
 * white balance did to it. The model sees that cast as part of the card, which moves the vector
 * further than the difference between two genuinely different cards. Grey-world is the cheapest
 * correction that needs no reference point in the scene, and applying it to both sides costs
 * nothing at match time.
 *
 * @param image
 * @returns a colour-balanced copy
 */
export function greyWorldBalance(image: RgbaImage): RgbaImage {
    const { data, width, height } = image;
    const pixels = width * height;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let index = 0; index < pixels; index += 1) {
        red += data[index * 4];
        green += data[index * 4 + 1];
        blue += data[index * 4 + 2];
    }
    const grey = (red + green + blue) / 3;
    const gains = [grey / Math.max(red, 1), grey / Math.max(green, 1), grey / Math.max(blue, 1)];

    const output = new Uint8ClampedArray(data.length);
    for (let index = 0; index < pixels; index += 1) {
        const offset = index * 4;
        output[offset] = data[offset] * gains[0];
        output[offset + 1] = data[offset + 1] * gains[1];
        output[offset + 2] = data[offset + 2] * gains[2];
        output[offset + 3] = data[offset + 3];
    }
    return { data: output, width, height };
}

/**
 * Resamples an RGBA image to the model input and normalizes it into CHW float planes.
 *
 * The resampling is an area average over the source pixels covered by each target pixel, which
 * is the same family as the reference images' own downscale and, unlike point sampling, does not
 * alias. That matters more than it sounds: a rectified card is 488×680 and the model input is
 * 224×224, so more than four source pixels fall into every target pixel. Point sampling would
 * discard most of them and would discard *different* ones than the index build did, putting a
 * query into a systematically different space than the vectors it is compared against.
 *
 * The aspect ratio is deliberately not preserved: a rectified card and a reference scan are both
 * 488×680 and are squashed the same way, so consistency matters and letterboxing would only
 * waste input area.
 *
 * @param image any RGBA buffer, typically a rectified card
 * @returns normalized CHW floats, ready as model input
 */
export function preprocess(image: RgbaImage): Float32Array {
    const { data, width, height } = image;
    const pixels = IMAGE_SIZE * IMAGE_SIZE;
    const output = new Float32Array(3 * pixels);

    for (let y = 0; y < IMAGE_SIZE; y += 1) {
        const fromY = Math.floor((y * height) / IMAGE_SIZE);
        const toY = Math.max(fromY + 1, Math.floor(((y + 1) * height) / IMAGE_SIZE));
        for (let x = 0; x < IMAGE_SIZE; x += 1) {
            const fromX = Math.floor((x * width) / IMAGE_SIZE);
            const toX = Math.max(fromX + 1, Math.floor(((x + 1) * width) / IMAGE_SIZE));

            let red = 0;
            let green = 0;
            let blue = 0;
            for (let sourceY = fromY; sourceY < toY; sourceY += 1) {
                let offset = (sourceY * width + fromX) * 4;
                for (let sourceX = fromX; sourceX < toX; sourceX += 1) {
                    red += data[offset];
                    green += data[offset + 1];
                    blue += data[offset + 2];
                    offset += 4;
                }
            }
            const area = (toY - fromY) * (toX - fromX);
            const target = y * IMAGE_SIZE + x;
            output[target] = (red / area / 255 - MEAN[0]) / STD[0];
            output[pixels + target] = (green / area / 255 - MEAN[1]) / STD[1];
            output[2 * pixels + target] = (blue / area / 255 - MEAN[2]) / STD[2];
        }
    }
    return output;
}

/**
 * Pools one model output into unit-length vectors.
 *
 * The CLS token carries the card's global impression, the patch mean the local detail that
 * separates two printings sharing an illustration. Each half is normalized before being
 * concatenated so neither can dominate by magnitude, and the result is normalized again so a
 * dot product is a cosine.
 *
 * @param hidden flat last_hidden_state of shape [count, tokens, HIDDEN_DIM]
 * @param count images in the batch
 * @param tokens tokens per image, the CLS token first
 * @returns one vector of length {@link EMBEDDING_DIM} per image
 */
export function poolHidden(hidden: Float32Array | number[], count: number, tokens: number): Float32Array[] {
    const vectors: Float32Array[] = [];
    for (let item = 0; item < count; item += 1) {
        const base = item * tokens * HIDDEN_DIM;
        const vector = new Float32Array(EMBEDDING_DIM);

        let clsNorm = 0;
        for (let d = 0; d < HIDDEN_DIM; d += 1) {
            const value = hidden[base + d];
            vector[d] = value;
            clsNorm += value * value;
        }
        clsNorm = Math.sqrt(clsNorm) || 1;
        for (let d = 0; d < HIDDEN_DIM; d += 1) vector[d] /= clsNorm;

        let patchNorm = 0;
        for (let d = 0; d < HIDDEN_DIM; d += 1) {
            let sum = 0;
            for (let token = 1; token < tokens; token += 1) sum += hidden[base + token * HIDDEN_DIM + d];
            const value = sum / (tokens - 1);
            vector[HIDDEN_DIM + d] = value;
            patchNorm += value * value;
        }
        patchNorm = Math.sqrt(patchNorm) || 1;
        for (let d = 0; d < HIDDEN_DIM; d += 1) vector[HIDDEN_DIM + d] /= patchNorm;

        let norm = 0;
        for (let d = 0; d < EMBEDDING_DIM; d += 1) norm += vector[d] * vector[d];
        norm = Math.sqrt(norm) || 1;
        for (let d = 0; d < EMBEDDING_DIM; d += 1) vector[d] /= norm;

        vectors.push(vector);
    }
    return vectors;
}

/**
 * The full path from a rectified card to model input.
 *
 * The one entry point for both sides. Anything that embeds a card, whether it is the index
 * builder in Node or the scanner in a browser, goes through here, because the moment the two
 * differ the nearest neighbour of a query stops being the right card.
 *
 * @param image a rectified card
 * @param variant which preprocessing to apply; the shipped one unless a tool is comparing
 * @returns normalized CHW floats, ready as model input
 */
export async function prepareForModel(image: RgbaImage, variant: Preprocessing = PREPROCESSING): Promise<Float32Array> {
    if (variant === "bilinear448x320") {
        const { width, height } = inputSize(variant);
        return preprocessBilinear(image, width, height);
    }
    return preprocess(variant === "clahe4+area224" ? await equaliseLocalContrast(image) : image);
}

/**
 * Turns one model output into unit-length vectors, the way the model's index was built.
 *
 * @param model which model produced the output
 * @param output the flat output tensor
 * @param dims the output tensor's shape, the batch first
 * @returns one vector of length `model.dim` per image
 */
export function poolOutput(
    model: EmbeddingModelSpec,
    output: Float32Array | number[],
    dims: readonly number[],
): Float32Array[] {
    const count = dims[0];
    if (model.pooling === "cls+patchmean") return poolHidden(output, count, dims[1]);
    if (dims[1] !== model.dim) throw new Error(`${model.id} liefert ${dims[1]} Werte, erwartet ${model.dim}`);

    const vectors: Float32Array[] = [];
    for (let item = 0; item < count; item += 1) {
        const vector = Float32Array.from(output.slice(item * model.dim, (item + 1) * model.dim));
        let norm = 0;
        for (const value of vector) norm += value * value;
        norm = Math.sqrt(norm) || 1;
        for (let d = 0; d < vector.length; d += 1) vector[d] /= norm;
        vectors.push(vector);
    }
    return vectors;
}
