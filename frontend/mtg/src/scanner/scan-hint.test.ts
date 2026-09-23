import { describe, expect, it } from "vitest";
import { createScanHint } from "./scan-hint";
import type { Shortcoming } from "./frame-gate";

/**
 * What the screen shows after each frame, frames 250 ms apart.
 *
 * @param frames
 * @param step
 * @returns
 */
function screen(frames: (Shortcoming | null)[], step = 250): (Shortcoming | null)[] {
    const hint = createScanHint();
    return frames.map((shortcoming, frame) => hint.observe(shortcoming, frame * step));
}

describe("scan hint", () => {
    it("shows the first complaint at once", () => {
        expect(screen(["moving"])).toEqual(["moving"]);
    });

    it("does not strobe between two complaints that alternate", () => {
        expect(screen(["moving", "blurred", "moving", "blurred", "moving"])).toEqual([
            "moving",
            "moving",
            "moving",
            "moving",
            "moving",
        ]);
    });

    it("hands over to a different complaint that two frames agree on", () => {
        expect(screen(["moving", "tilted", "tilted", "tilted"])).toEqual(["moving", "moving", "tilted", "tilted"]);
    });

    it("keeps advice up long enough to be read after the frame goes clean", () => {
        expect(screen(["moving", null, null])).toEqual(["moving", "moving", "moving"]);
    });

    it("takes the advice down once it has had its time", () => {
        expect(screen(["moving", null, null, null, null, null, null])).toEqual([
            "moving",
            "moving",
            "moving",
            "moving",
            "moving",
            null,
            null,
        ]);
    });

    it("keeps a complaint that stays true up without re-showing it", () => {
        expect(screen(["moving", "moving", "moving", "moving", "moving", "moving", "moving"])).toEqual([
            "moving",
            "moving",
            "moving",
            "moving",
            "moving",
            "moving",
            "moving",
        ]);
    });

    it("forgets a half-built replacement when a clean frame arrives", () => {
        expect(screen(["moving", "tilted", null, "tilted"])).toEqual(["moving", "moving", "moving", "moving"]);
    });

    it("takes the advice down at once for a card that was booked", () => {
        const hint = createScanHint();
        expect(hint.observe("moving", 0)).toBe("moving");
        hint.clear();
        expect(hint.observe(null, 250)).toBeNull();
    });

    it("starts over after clearing rather than resuming the old dwell", () => {
        const hint = createScanHint();
        hint.observe("moving", 0);
        hint.clear();
        expect(hint.observe("tilted", 250)).toBe("tilted");
    });
});
