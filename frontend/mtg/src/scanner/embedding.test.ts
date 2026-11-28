import { describe, expect, it } from "vitest";
import type { RgbaImage } from "./card-detect";
import {
    EMBEDDING_DIM,
    EMBEDDING_MODELS,
    inputSize,
    isEmbeddingModel,
    poolOutput,
    prepareForModel,
    preprocessBilinear,
} from "./embedding";

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * Builds an RGBA image from a per-pixel colour function
 *
 * @param width
 * @param height
 * @param colour returns red, green and blue for a pixel
 * @returns the image
 */
function image(width: number, height: number, colour: (x: number, y: number) => number[]): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const [red, green, blue] = colour(x, y);
            data.set([red, green, blue, 255], (y * width + x) * 4);
        }
    }
    return { data, width, height };
}

/**
 * The normalized value a byte becomes in one channel
 *
 * @param value 0 to 255
 * @param channel 0 red, 1 green, 2 blue
 * @returns the model input value
 */
function normalized(value: number, channel: number): number {
    return (value / 255 - MEAN[channel]) / STD[channel];
}

describe("dhv-embed preprocessing", () => {
    it("stretches a rectified card to 320×448 in RGB planes", async () => {
        const card = image(488, 680, () => [200, 100, 50]);
        const input = await prepareForModel(card, "bilinear448x320");
        const planes = 320 * 448;
        expect(inputSize("bilinear448x320")).toEqual({ width: 320, height: 448 });
        expect(input.length).toBe(3 * planes);
        expect(input[0]).toBeCloseTo(normalized(200, 0), 5);
        expect(input[planes]).toBeCloseTo(normalized(100, 1), 5);
        expect(input[2 * planes + planes - 1]).toBeCloseTo(normalized(50, 2), 5);
    });

    it("blends the two nearest pixels with aligned centres, like OpenCV's INTER_LINEAR", () => {
        const ramp = image(4, 1, (x) => [x * 40, 0, 0]);
        const input = preprocessBilinear(ramp, 2, 1);
        expect(input[0]).toBeCloseTo(normalized(20, 0), 5);
        expect(input[1]).toBeCloseTo(normalized(100, 0), 5);
    });

    it("rounds the resized pixels to 8 bit before normalising", () => {
        const pair = image(2, 1, (x) => [x, 0, 0]);
        const input = preprocessBilinear(pair, 1, 1);
        expect(input[0]).toBeCloseTo(normalized(1, 0), 5);
    });

    it("clamps at the border instead of reading outside the image", () => {
        const ramp = image(2, 2, (x, y) => [x * 100 + y * 10, 0, 0]);
        const input = preprocessBilinear(ramp, 4, 4);
        expect(input[0]).toBeCloseTo(normalized(0, 0), 5);
        expect(input[15]).toBeCloseTo(normalized(110, 0), 5);
    });

    it("leaves DINOv2's 224 px area average as it was", async () => {
        const card = image(488, 680, () => [10, 20, 30]);
        const input = await prepareForModel(card, "area224");
        expect(inputSize("area224")).toEqual({ width: 224, height: 224 });
        expect(input.length).toBe(3 * 224 * 224);
        expect(input[0]).toBeCloseTo(normalized(10, 0), 5);
    });
});

describe("pooling per model", () => {
    it("re-normalises each row of dhv-embed's output", () => {
        const output = new Float32Array(2 * 256);
        output[0] = 3;
        output[1] = 4;
        output[256 + 5] = -2;
        const [first, second] = poolOutput(EMBEDDING_MODELS["dhv-embed"], output, [2, 256]);
        expect(first.length).toBe(256);
        expect(first[0]).toBeCloseTo(0.6, 6);
        expect(first[1]).toBeCloseTo(0.8, 6);
        expect(second[5]).toBeCloseTo(-1, 6);
    });

    it("refuses an output that is not the model's vector length", () => {
        expect(() => poolOutput(EMBEDDING_MODELS["dhv-embed"], new Float32Array(768), [1, 768])).toThrow("768");
    });

    it("pools DINOv2's hidden state into CLS plus patch mean", () => {
        const hidden = new Float32Array(3 * 384).fill(1);
        const [vector] = poolOutput(EMBEDDING_MODELS["dinov2-small"], hidden, [1, 3, 384]);
        expect(vector.length).toBe(EMBEDDING_DIM);
        expect(vector.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1, 5);
    });
});

describe("model registry", () => {
    it("names each model's own preprocessing, index and vector length", () => {
        expect(EMBEDDING_MODELS["dinov2-small"].dim).toBe(EMBEDDING_DIM);
        expect(EMBEDDING_MODELS["dinov2-small"].index).toBe("scan-index");
        expect(EMBEDDING_MODELS["dhv-embed"].index).not.toBe(EMBEDDING_MODELS["dinov2-small"].index);
        expect(EMBEDDING_MODELS["dhv-embed"].preprocessing).toBe("bilinear448x320");
    });

    it("recognises only known model names", () => {
        expect(isEmbeddingModel("dhv-embed")).toBe(true);
        expect(isEmbeddingModel("dinov2-small")).toBe(true);
        expect(isEmbeddingModel("toString")).toBe(false);
        expect(isEmbeddingModel(null)).toBe(false);
    });
});
