import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    backend: "wasm",
    variant: 0,
    confirm: vi.fn(),
    preview: vi.fn(),
    seen: vi.fn(() => false),
    loadIndex: vi.fn(),
    loadModel: vi.fn(),
    loadCv: vi.fn(),
    loadOcr: vi.fn(),
    warm: vi.fn(),
}));
vi.mock("./embedder", () => ({ loadEmbedder: mocks.loadModel }));
vi.mock("./pipeline", () => ({
    loadScanIndex: mocks.loadIndex,
    scanFrame: vi.fn(),
}));
vi.mock("./opencv", () => ({ loadOpenCv: mocks.loadCv }));
vi.mock("./ocr", () => ({ loadReader: mocks.loadOcr }));
vi.mock("./live-pipeline", () => ({
    previewFrame: mocks.preview,
    confirmPreview: mocks.confirm,
    resetFrameGate: vi.fn(),
    uprightVariant: (variant: number) => variant === 0,
    createAgreementTracker: () => ({ seen: mocks.seen, reset: vi.fn() }),
    createVariantSelector: () => ({ next: () => mocks.variant, record: vi.fn(), reset: vi.fn() }),
}));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.backend = "wasm";
    mocks.loadIndex.mockResolvedValue({ manifest: { count: 1 }, warm: mocks.warm });
    mocks.loadModel.mockImplementation(async () => ({ backend: mocks.backend, runtime: "test", notes: [] }));
    mocks.loadCv.mockResolvedValue({});
    mocks.loadOcr.mockResolvedValue({});
    mocks.variant = 0;
    mocks.seen.mockReturnValue(false);
    mocks.preview.mockResolvedValue({
        candidates: [{ printing: { id: "card", face: 0, name: "Card", set: "abc", collectorNumber: "1" }, score: 0.8 }],
        named: false,
        sightScore: 0.8,
        crops: [],
        attempted: true,
        shortcomings: [],
        timings: { detect: 1, gate: 1, embed: 1000, search: 1, ocr: 1, references: 0, verify: 0 },
    });
    mocks.confirm.mockResolvedValue({ status: "unrecognised", reason: "weak-match", bestInliers: 5 });
    vi.stubGlobal(
        "OffscreenCanvas",
        /**
         *
         */
        class {
            /**
             * @returns the mock drawing context
             */
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

/**
 * Load the real worker dispatcher with mock vision engines, then process a camera frame.
 *
 * @returns the worker's completed frame, if any
 */
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
    it("loads iOS components sequentially without starting an OCR worker", async () => {
        vi.stubGlobal("navigator", { userAgent: "iPhone AppleWebKit/605.1.15" });
        mocks.loadIndex.mockImplementationOnce(async () => {
            expect(mocks.loadModel).not.toHaveBeenCalled();
            expect(mocks.loadCv).not.toHaveBeenCalled();
            return { manifest: { count: 1 }, warm: mocks.warm };
        });
        mocks.loadModel.mockImplementationOnce(async () => {
            expect(mocks.loadCv).not.toHaveBeenCalled();
            return { backend: "wasm", runtime: "test", notes: [] };
        });
        await scan();
        expect(mocks.loadModel).toHaveBeenCalledWith(expect.any(Function), "off");
        expect(mocks.loadCv).toHaveBeenCalledOnce();
        expect(mocks.loadOcr).not.toHaveBeenCalled();
        expect(mocks.warm).not.toHaveBeenCalled();
    });

    it("discards an in-flight frame after tracking is reset", async () => {
        const preview = await mocks.preview();
        mocks.preview.mockImplementationOnce(async () => {
            const scope = self as unknown as { onmessage: (event: { data: unknown }) => Promise<void> };
            await scope.onmessage({ data: { type: "reset", id: 3 } });
            return preview;
        });
        expect(await scan()).toBeUndefined();
        expect(mocks.confirm).not.toHaveBeenCalled();
        const scope = self as unknown as { postMessage: ReturnType<typeof vi.fn> };
        expect(scope.postMessage).toHaveBeenCalledWith({
            type: "error",
            id: 2,
            message: "Scan verworfen: Sitzung beendet.",
        });
    });

    it("posts detection while the rest of the preview is still pending", async () => {
        const preview = await mocks.preview();
        mocks.preview.mockImplementationOnce(async (...args: unknown[]) => {
            const detection = { quad: null, fromGuide: true };
            (args[7] as (value: unknown) => void)(detection);
            const scope = self as unknown as { postMessage: ReturnType<typeof vi.fn> };
            expect(scope.postMessage).toHaveBeenCalledWith({ type: "detected", id: 2, detection });
            expect(scope.postMessage.mock.calls.some(([message]) => message.type === "live")).toBe(false);
            expect(mocks.confirm).not.toHaveBeenCalled();
            return preview;
        });
        await scan();
    });

    it("does not verify or accept a single WASM frame", async () => {
        const result = await scan();
        expect(mocks.preview).toHaveBeenCalledOnce();
        expect(mocks.preview.mock.calls[0][6]).toBe(0.75);
        expect(mocks.confirm).not.toHaveBeenCalled();
        expect(result.outcome).toBeNull();
        expect(result.attempts).toBe(1);
    });

    it("still rejects weak verification after frames agree", async () => {
        mocks.seen.mockReturnValue(true);
        expect((await scan()).outcome.status).toBe("unrecognised");
        expect(mocks.confirm).toHaveBeenCalledOnce();
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

    it.each([
        ["the gate refused the card", ["moving"], false],
        ["there was no card", [], true],
    ])("reports a frame where %s without letting it vote", async (_case, shortcomings, fromGuide) => {
        const preview = await mocks.preview();
        mocks.preview.mockResolvedValue({ ...preview, candidates: [], attempted: false, shortcomings, fromGuide });
        mocks.seen.mockReturnValue(true);
        const result = await scan();
        expect(result.shortcomings).toEqual(shortcomings);
        expect(result.outcome).toBeNull();
        expect(result.preview).toBeNull();
        expect(mocks.confirm).not.toHaveBeenCalled();
        expect(mocks.seen).not.toHaveBeenCalled();
    });
});
