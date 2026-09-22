import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedPrinting } from "./embedding-index";
import { loadReferenceImage } from "./reference-images";

vi.mock("./reference-images", () => ({ loadReferenceImage: vi.fn() }));
vi.mock("./feature-verify", () => ({
    describeCard: vi.fn(async () => ({ count: 0, descriptors: new Uint8Array(), points: new Float32Array() })),
}));
const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
/**
 * A cache key for a printing; the cache does not inspect catalogue fields.
 *
 * @param id
 * @returns a minimal printing fixture
 */
const printing = (id: string) => ({ id, face: 0 }) as IndexedPrinting;

beforeEach(() => {
    vi.resetModules();
    vi.mocked(loadReferenceImage).mockReset();
});
afterEach(() => vi.useRealTimers());

describe("live reference cache", () => {
    it("overlaps at most three downloads and preserves shortlist order", async () => {
        vi.useFakeTimers();
        let active = 0,
            peak = 0;
        vi.mocked(loadReferenceImage).mockImplementation(async () => {
            peak = Math.max(peak, ++active);
            await new Promise((resolve) => setTimeout(resolve, 100));
            active--;
            return image;
        });
        const { loadReferences } = await import("./reference-cache");
        const work = loadReferences(Array.from({ length: 6 }, (_, i) => printing(String(i))));
        await vi.advanceTimersByTimeAsync(200);
        expect((await work).every(Boolean)).toBe(true);
        expect(peak).toBe(3);
        expect(vi.getTimerCount()).toBe(0);
        await loadReferences([printing("0")]);
        expect(loadReferenceImage).toHaveBeenCalledTimes(6);
    });

    it("aborts slow downloads and retries failures on the next frame", async () => {
        vi.useFakeTimers();
        vi.mocked(loadReferenceImage).mockImplementation(
            async (_id, _face, signal) =>
                new Promise((resolve) => {
                    signal!.addEventListener("abort", () => resolve(null), { once: true });
                }),
        );
        const { loadReferences } = await import("./reference-cache");
        const work = loadReferences([printing("slow")]);
        await vi.advanceTimersByTimeAsync(2500);
        expect(await work).toEqual([null]);
        vi.mocked(loadReferenceImage).mockResolvedValue(image);
        expect((await loadReferences([printing("slow")]))[0]?.image).toBe(image);
        expect(loadReferenceImage).toHaveBeenCalledTimes(2);
    });

    it("evicts the least recently used decoded image", async () => {
        vi.mocked(loadReferenceImage).mockResolvedValue(image);
        const { loadReferences } = await import("./reference-cache");
        for (let i = 0; i < 32; i++) await loadReferences([printing(String(i))]);
        await loadReferences([printing("0")]);
        await loadReferences([printing("32")]);
        await loadReferences([printing("0")]);
        expect(loadReferenceImage).toHaveBeenCalledTimes(33);
        await loadReferences([printing("1")]);
        expect(loadReferenceImage).toHaveBeenCalledTimes(34);
    });
});
