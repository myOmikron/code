import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    wasm: vi.fn(),
    gpu: vi.fn(),
    env: { wasm: { numThreads: 0 }, versions: { web: "test" } },
}));
vi.mock("onnxruntime-web/wasm", () => ({
    env: mocks.env,
    Tensor: vi.fn(),
    InferenceSession: { create: mocks.wasm },
}));
vi.mock("onnxruntime-web/webgpu", () => ({
    env: mocks.env,
    Tensor: vi.fn(),
    InferenceSession: { create: mocks.gpu },
}));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("self", { crossOriginIsolated: true });
    const session = {
        inputNames: ["input"],
        outputNames: ["output"],
        run: vi.fn(async () => ({
            output: { dims: [1, 2, 384], getData: async () => new Float32Array(768).fill(1) },
        })),
        release: vi.fn(),
    };
    mocks.wasm.mockResolvedValue(session);
    mocks.gpu.mockResolvedValue(session);
});
afterEach(() => vi.unstubAllGlobals());

it("uses the non-JSEP runtime and one thread on iPhone, even when WebGPU was requested", async () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone AppleWebKit/605.1.15", hardwareConcurrency: 6 });
    const { loadEmbedder } = await import("./embedder");
    const model = await loadEmbedder(undefined, "full");
    expect(model.backend).toBe("wasm");
    expect(mocks.wasm).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ executionProviders: ["wasm"] }),
    );
    expect(mocks.gpu).not.toHaveBeenCalled();
    expect(mocks.env.wasm.numThreads).toBe(1);
});

it("retains the WebGPU runtime on Android", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android AppleWebKit/537.36 Chrome/130", hardwareConcurrency: 8 });
    const { loadEmbedder } = await import("./embedder");
    const model = await loadEmbedder();
    expect(model.backend).toBe("webgpu");
    expect(mocks.gpu).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ executionProviders: ["webgpu"] }),
    );
    expect(mocks.wasm).not.toHaveBeenCalled();
    expect(mocks.env.wasm.numThreads).toBe(4);
});
