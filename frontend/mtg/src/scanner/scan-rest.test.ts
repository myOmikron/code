import { describe, expect, it } from "vitest";
import { createScanRest } from "./scan-rest";

describe("recognised image rest", () => {
    const pixels = new Uint8ClampedArray(64).fill(100);

    it("continues scanning until recognised, then skips stable images with small camera noise", () => {
        const rest = createScanRest();
        expect(rest.needsScan(pixels, 0)).toBe(true);
        rest.hold(pixels, 0);
        expect(rest.needsScan(pixels, 200)).toBe(false);
        expect(rest.needsScan(new Uint8ClampedArray(64).fill(105), 400)).toBe(false);
        expect(rest.needsScan(pixels, 5000)).toBe(true);
    });

    it("resumes on a changed image and stays active for multi-frame agreement", () => {
        const rest = createScanRest();
        rest.hold(pixels, 0);
        const changed = new Uint8ClampedArray(64).fill(140);
        expect(rest.needsScan(changed, 200)).toBe(true);
        expect(rest.needsScan(changed, 400)).toBe(true);
    });

    it("clears the previous camera image on reset", () => {
        const rest = createScanRest();
        rest.hold(pixels, 0);
        rest.reset();
        expect(rest.needsScan(pixels, 200)).toBe(true);
    });
});
