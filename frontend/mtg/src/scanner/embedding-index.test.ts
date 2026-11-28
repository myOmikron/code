import { describe, expect, it } from "vitest";
import { createEmbeddingIndex } from "./embedding-index";
import type { IndexBuffers, IndexManifest } from "./embedding-index";

/**
 * A two-row index whose manifest says it was built a given way
 *
 * @param manifest what differs from a DINOv2 index
 * @returns the buffers
 */
function buffers(manifest: Partial<IndexManifest>): IndexBuffers {
    const sourceDim = manifest.sourceDim ?? 768;
    const dim = 2;
    const projection = new Float32Array((dim + 1) * sourceDim);
    projection[sourceDim] = 1;
    projection[2 * sourceDim + 1] = 1;
    return {
        manifest: {
            formatVersion: 1,
            model: "dinov2-small",
            preprocessing: "area224",
            sourceDim,
            dim,
            count: 2,
            scale: 100,
            ...manifest,
        },
        projection: projection.buffer,
        vectors: new Int8Array([100, 0, 0, 100]).buffer,
        cards: [
            { i: "a", n: "Alpha", s: "aaa", c: "1", l: "en", f: 0 },
            { i: "b", n: "Beta", s: "bbb", c: "2", l: "en", f: 0 },
        ],
    };
}

const dhv: Partial<IndexManifest> = {
    model: "dhv-embed",
    modelFile: "mtg_embed_fp32.onnx",
    preprocessing: "bilinear448x320",
    sourceDim: 256,
};

describe("model and index pairing", () => {
    it("opens the shipped DINOv2 index, which predates the model file record", () => {
        const index = createEmbeddingIndex(buffers({}));
        const query = new Float32Array(768);
        query[1] = 1;
        expect(index.search(index.project(query), 1)[0].printing.name).toBe("Beta");
    });

    it("opens a dhv-embed index for dhv-embed queries", () => {
        const index = createEmbeddingIndex(buffers(dhv), { model: "dhv-embed" });
        const query = new Float32Array(256);
        query[0] = 1;
        expect(index.search(index.project(query), 1)[0].printing.name).toBe("Alpha");
    });

    it("refuses a DINOv2 index for dhv-embed queries", () => {
        expect(() => createEmbeddingIndex(buffers({}), { model: "dhv-embed" })).toThrow('"dinov2-small"');
    });

    it("refuses a dhv-embed index for DINOv2 queries", () => {
        expect(() => createEmbeddingIndex(buffers(dhv))).toThrow('"dhv-embed"');
    });

    it("refuses an index built with another export of the same model", () => {
        expect(() =>
            createEmbeddingIndex(buffers({ ...dhv, modelFile: "mtg_embed_int8.onnx" }), { model: "dhv-embed" }),
        ).toThrow("mtg_embed_int8.onnx");
        expect(() =>
            createEmbeddingIndex(buffers(dhv), { model: "dhv-embed", modelFile: "mtg_embed_int8.onnx" }),
        ).toThrow("mtg_embed_fp32.onnx");
    });

    it("refuses an index built with other preprocessing", () => {
        expect(() =>
            createEmbeddingIndex(buffers({ ...dhv, preprocessing: "area224" }), { model: "dhv-embed" }),
        ).toThrow("bilinear448x320");
        expect(() => createEmbeddingIndex(buffers({}), { preprocessing: "clahe4+area224" })).toThrow("clahe4");
    });

    it("refuses an index whose source vectors are not the model's length", () => {
        expect(() => createEmbeddingIndex(buffers({ ...dhv, sourceDim: 768 }), { model: "dhv-embed" })).toThrow("768");
    });

    it("refuses a manifest that names no model", () => {
        expect(() => createEmbeddingIndex(buffers({ model: undefined }))).toThrow("unbekannt");
    });
});
