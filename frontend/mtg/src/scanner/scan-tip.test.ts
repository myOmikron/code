import { describe, expect, it } from "vitest";
import { luminanceOf, searchTip, TIP_AFTER } from "./scan-tip";

/**
 * A uniform grey 32×32 sample.
 *
 * @param grey
 * @returns
 */
function sample(grey: number): Uint8ClampedArray {
    return new Uint8ClampedArray(32 * 32 * 4).fill(grey);
}

describe("search tip", () => {
    it("stays quiet while a card could still be settling into the guide", () => {
        expect(searchTip(sample(120), 0, TIP_AFTER - 1)).toBeNull();
    });

    it("suggests a lighter surface once no card has been found for a while", () => {
        expect(searchTip(sample(120), 0, TIP_AFTER)).toBe("lighter-surface");
    });

    it("suggests more light when the picture is dark", () => {
        expect(searchTip(sample(20), 0, TIP_AFTER)).toBe("more-light");
    });

    it("counts from the last card found, not from the start", () => {
        expect(searchTip(sample(120), 10_000, 10_000 + TIP_AFTER - 1)).toBeNull();
    });

    it("falls back to the surface tip before the first sample", () => {
        expect(searchTip(null, 0, TIP_AFTER)).toBe("lighter-surface");
    });

    it("weighs the channels the way the gate does", () => {
        const red = new Uint8ClampedArray([255, 0, 0, 255]);
        expect(luminanceOf(red)).toBeCloseTo(76.245);
    });
});
