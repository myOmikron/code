import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    backend: "wasm",
    variant: 0,
    confirm: vi.fn(),
    preview: vi.fn(),
    seen: vi.fn(() => false),
}));
vi.mock("./embedder", () => ({ loadEmbedder: async () => ({ backend: mocks.backend, runtime: "test", notes: [] }) }));
vi.mock("./pipeline", () => ({
    loadScanIndex: async () => ({ manifest: { count: 1 }, warm: vi.fn() }),
    scanFrame: vi.fn(),
}));
vi.mock("./opencv", () => ({ loadOpenCv: async () => ({}) }));
vi.mock("./ocr", () => ({ loadReader: async () => ({}) }));
vi.mock("./live-pipeline", () => ({
    previewFrame: mocks.preview,
    confirmPreview: mocks.confirm,
    uprightVariant: (variant: number) => variant === 0,
    createAgreementTracker: () => ({ seen: mocks.seen, reset: vi.fn() }),
    createVariantSelector: () => ({ next: () => mocks.variant, record: vi.fn(), reset: vi.fn() }),
}));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.backend = "wasm";
    mocks.variant = 0;
    mocks.preview.mockResolvedValue({
        candidates: [{ printing: { id: "card", face: 0, name: "Card", set: "abc", collectorNumber: "1" }, score: 0.8 }],
        named: false,
        sightScore: 0.8,
        crops: [],
        timings: { detect: 1, embed: 1000, search: 1, ocr: 1, references: 0, verify: 0 },
    });
    mocks.confirm.mockResolvedValue({ status: "unrecognised", reason: "weak-match", bestInliers: 5 });
    vi.stubGlobal(
        "OffscreenCanvas",
        class {
            getContext() {
                return {
                    drawImage: vi.fn(),
                    getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 }),
                };
            }
        },
    );
});
afterEach(() => vi.unstubAllGlobals());

/** Load the real worker dispatcher with mock vision engines, then process a camera frame. */
async function scan() {
    const scope = {
        postMessage: vi.fn(),
        onmessage: undefined as unknown as (event: { data: unknown }) => Promise<void>,
    };
    vi.stubGlobal("self", scope);
    await import("./scan-worker");
    await scope.onmessage({ data: { type: "load", id: 1 } });
    const frame = { width: 2, height: 2, close: vi.fn() };
    await scope.onmessage({ data: { type: "live", id: 2, frame, debug: false, viewAspect: 0.75 } });
    expect(frame.close).toHaveBeenCalledOnce();
    return scope.postMessage.mock.calls.find(([result]) => result.type === "live")?.[0];
}

describe("live worker scheduling", () => {
    it("verifies the first WASM shortlist without another model run, but does not accept a weak result", async () => {
        const result = await scan();
        expect(mocks.preview).toHaveBeenCalledOnce();
        expect(mocks.preview.mock.calls[0][6]).toBe(0.75);
        expect(mocks.confirm).toHaveBeenCalledOnce();
        expect(result.outcome.status).toBe("unrecognised");
        expect(result.attempts).toBe(1);
    });

    it("keeps the agreement gate for WebGPU", async () => {
        mocks.backend = "webgpu";
        expect((await scan()).outcome).toBeNull();
        expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it("does not confirm an exploratory rotated crop", async () => {
        mocks.variant = 2;
        expect((await scan()).outcome).toBeNull();
        expect(mocks.confirm).not.toHaveBeenCalled();
    });
});
