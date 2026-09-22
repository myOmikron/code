import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const targets: { postMessage: ReturnType<typeof vi.fn>; onmessage: (event: { data: unknown }) => void }[] = [];

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
