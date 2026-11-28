import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The parts of a Worker the scan client touches */
type FakeWorker = {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage: (event: { data: unknown }) => void;
    onerror: ((event: { message: string; preventDefault: () => void }) => void) | null;
};

const targets: FakeWorker[] = [];

beforeEach(() => {
    vi.resetModules();
    targets.length = 0;
    vi.stubGlobal(
        "Worker",
        /**
         *
         */
        class {
            postMessage = vi.fn();
            terminate = vi.fn();
            onerror = null;
            onmessage = (_event: { data: unknown }) => {};
            /**
             *
             */
            constructor() {
                targets.push(this);
            }
        },
    );
});
afterEach(() => vi.unstubAllGlobals());

describe("live frame progress", () => {
    it("clears the cached backend verdict and reloads for an explicit WebGPU retry", async () => {
        const removeItem = vi.fn();
        const reload = vi.fn();
        vi.stubGlobal("localStorage", { removeItem });
        vi.stubGlobal("window", { location: { reload } });
        const { retryWebGpu } = await import("./scan-client");
        retryWebGpu();
        expect(removeItem).toHaveBeenCalledWith("scanner.webgpu-strategy.v2");
        expect(reload).toHaveBeenCalledOnce();
    });

    it("can retry when browser storage is blocked", async () => {
        const reload = vi.fn();
        vi.stubGlobal("localStorage", {
            removeItem: () => {
                throw new Error("blocked");
            },
        });
        vi.stubGlobal("window", { location: { reload } });
        const { retryWebGpu } = await import("./scan-client");
        retryWebGpu();
        expect(reload).toHaveBeenCalledOnce();
    });

    it("delivers geometry early without completing the scan or keeping the listener after completion", async () => {
        const { scanLiveFrame } = await import("./scan-client");
        const detected = vi.fn();
        let finished = false;
        const result = scanLiveFrame({} as ImageBitmap, false, "en", [], 0.75, detected);
        void result.then(() => {
            finished = true;
        });
        const target = targets[0];
        const { id } = target.postMessage.mock.calls[0][0];
        const geometry = { quad: null, fromGuide: true };
        target.onmessage({ data: { type: "detected", id, detection: geometry } });
        await Promise.resolve();
        expect(detected).toHaveBeenCalledWith(geometry);
        expect(finished).toBe(false);
        target.onmessage({ data: { type: "live", id, outcome: null } });
        await result;
        expect(finished).toBe(true);
        target.onmessage({ data: { type: "detected", id, detection: geometry } });
        expect(detected).toHaveBeenCalledOnce();
    });

    it("removes the geometry listener when recognition fails", async () => {
        const { scanLiveFrame } = await import("./scan-client");
        const detected = vi.fn();
        const result = scanLiveFrame({} as ImageBitmap, false, "en", [], 0, detected);
        const target = targets[0];
        const { id } = target.postMessage.mock.calls[0][0];
        const rejected = expect(result).rejects.toThrow("failed");
        target.onmessage({ data: { type: "error", id, message: "failed" } });
        await rejected;
        target.onmessage({ data: { type: "detected", id, detection: {} } });
        expect(detected).not.toHaveBeenCalled();
    });
});

describe("worker startup", () => {
    beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined }));

    it("fails the load when the worker never comes up, and starts a fresh one on retry", async () => {
        const { loadScanner } = await import("./scan-client");
        const first = loadScanner();
        const rejected = expect(first).rejects.toThrow("Der Scanner konnte nicht starten: SyntaxError");
        targets[0].onerror?.({ message: "SyntaxError", preventDefault: () => undefined });
        await rejected;
        expect(targets[0].terminate).toHaveBeenCalledOnce();

        void loadScanner();
        expect(targets).toHaveLength(2);
    });

    it("keeps a worker that already answered", async () => {
        const { loadScanner } = await import("./scan-client");
        void loadScanner();
        const target = targets[0];
        const { id } = target.postMessage.mock.calls[0][0];
        target.onmessage({ data: { type: "progress", id, progress: { stage: "manifest" } } });
        target.onerror?.({ message: "late", preventDefault: () => undefined });
        expect(target.terminate).not.toHaveBeenCalled();
    });
});
