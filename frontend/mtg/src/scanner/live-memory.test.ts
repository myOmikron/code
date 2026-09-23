import { afterEach, expect, it, vi } from "vitest";
import type { EmbeddingIndex } from "./embedding-index";
import type { Embedder } from "./embedder";
import { previewFrame } from "./live-pipeline";
import { loadReader } from "./ocr";

const detection = vi.hoisted(() => ({
    found: true,
    card: {
        quad: {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 60, y: 0 },
            bottomRight: { x: 60, y: 84 },
            bottomLeft: { x: 0, y: 84 },
        },
        areaFraction: 0.6,
        score: 1,
    },
}));

vi.mock("./card-detect", () => ({
    detectCardsIn: async () => (detection.found ? [detection.card] : []),
    shrinkQuad: (quad: unknown) => quad,
    rectifyCardIn: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
}));
// Keeps the frame gate away from OpenCV.
vi.mock("./image-quality", () => ({
    measureFrame: async () => ({
        areaFraction: 0.6,
        symmetry: 0.95,
        aspect: 0.95,
        motion: 0,
        sharpness: 600,
        exposure: { mean: 110, clipped: 0 },
    }),
}));
vi.mock("./ocr", () => ({
    loadReader: vi.fn(async () => ({ model: "test", readTitle: async () => "" })),
}));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    detection.found = true;
});

/**
 * Runs one frame against a counting model and index.
 *
 * @returns
 */
async function frame() {
    const search = vi.fn(() => []);
    const embed = vi.fn(async () => new Float32Array(768));
    const index = { project: (vector: Float32Array) => vector, search } as unknown as EmbeddingIndex;
    const embedder = { embed } as unknown as Embedder;
    const preview = await previewFrame(
        { width: 100, height: 140, data: new Uint8ClampedArray(100 * 140 * 4) },
        index,
        embedder,
        0,
    );
    return { preview, embed, search };
}

it.each([
    ["iPhone AppleWebKit/605.1.15", false],
    ["Android AppleWebKit/537.36 Chrome/130", true],
])("keeps recognition running with the expected OCR policy for %s", async (userAgent, ocr) => {
    vi.stubGlobal("navigator", { userAgent });
    const { preview, embed, search } = await frame();
    expect(embed).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledOnce();
    if (ocr) {
        expect(loadReader).toHaveBeenCalled();
        expect(preview.ocrModel).toBe("test");
    } else {
        expect(loadReader).not.toHaveBeenCalled();
        expect(preview.ocrModel).toBe("disabled");
        expect(preview.ocrError).toContain("WebKit-Schutzmodus");
    }
});

it("spends no reading, model run or search on a frame with no card in it", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android AppleWebKit/537.36 Chrome/130" });
    detection.found = false;
    const { preview, embed, search } = await frame();
    expect(embed).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(loadReader).not.toHaveBeenCalled();
    expect(preview.attempted).toBe(false);
    expect(preview.fromGuide).toBe(true);
    expect(preview.quad).toBeNull();
});
