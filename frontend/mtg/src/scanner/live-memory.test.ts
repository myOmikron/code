import { afterEach, expect, it, vi } from "vitest";
import type { EmbeddingIndex } from "./embedding-index";
import type { Embedder } from "./embedder";
import { previewFrame } from "./live-pipeline";
import { loadReader } from "./ocr";

vi.mock("./card-detect", () => ({
    detectCardsIn: async () => [],
    shrinkQuad: (quad: unknown) => quad,
    rectifyCardIn: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
}));
vi.mock("./ocr", () => ({
    loadReader: vi.fn(async () => ({ model: "test", readTitle: async () => "" })),
}));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

it.each([
    ["iPhone AppleWebKit/605.1.15", false],
    ["Android AppleWebKit/537.36 Chrome/130", true],
])("keeps recognition running with the expected OCR policy for %s", async (userAgent, ocr) => {
    vi.stubGlobal("navigator", { userAgent });
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
