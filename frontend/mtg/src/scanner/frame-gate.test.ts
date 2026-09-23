import { describe, expect, it } from "vitest";
import { createFrameGate, shortcomingsOf } from "./frame-gate";
import type { FrameQuality } from "./image-quality";
import type { CardQuad } from "./card-detect";

/**
 * A well-held card's measures.
 *
 * @param overrides
 * @returns
 */
function good(overrides: Partial<FrameQuality> = {}): FrameQuality {
    return {
        areaFraction: 0.6,
        symmetry: 0.95,
        aspect: 0.95,
        motion: 0.004,
        sharpness: 600,
        exposure: { mean: 110, clipped: 0.002 },
        ...overrides,
    };
}

const quad: CardQuad = {
    topLeft: { x: 0, y: 0 },
    topRight: { x: 100, y: 0 },
    bottomRight: { x: 100, y: 140 },
    bottomLeft: { x: 0, y: 140 },
};

/**
 * Worst shortcoming per frame, "ready" when none, "no-card" for null.
 *
 * @param frames
 * @param gate
 * @returns
 */
function run(frames: (FrameQuality | null)[], gate = createFrameGate()): string[] {
    return frames.map((quality) => {
        if (!quality) {
            gate.missed();
            return "no-card";
        }
        return gate.observe(quality, quad)[0] ?? "ready";
    });
}

describe("frame gate", () => {
    it("lets a well presented card through every frame", () => {
        expect(run([good(), good(), good()])).toEqual(["ready", "ready", "ready"]);
    });

    it("names what is wrong while the card is presented badly", () => {
        expect(run([good({ areaFraction: 0.1 })])).toEqual(["closer"]);
        expect(run([good({ symmetry: 0.5 })])).toEqual(["tilted"]);
        expect(run([good({ exposure: { mean: 110, clipped: 0.2 } })])).toEqual(["glare"]);
        expect(run([good({ exposure: { mean: 20, clipped: 0 } })])).toEqual(["dark"]);
        expect(run([good({ motion: 0.1 })])).toEqual(["moving"]);
    });

    it("treats the first sight of a card as still", () => {
        expect(run([good({ motion: Number.POSITIVE_INFINITY })])).toEqual(["ready"]);
    });

    it("refuses a frame much softer than the sharpest recent one", () => {
        expect(run([good({ sharpness: 900 }), good({ sharpness: 300 }), good({ sharpness: 850 })])).toEqual([
            "ready",
            "blurred",
            "ready",
        ]);
    });

    it("lets one exceptionally sharp frame stop mattering after a while", () => {
        const frames = [good({ sharpness: 3000 }), ...Array.from({ length: 12 }, () => good({ sharpness: 600 }))];
        const hints = run(frames);
        expect(hints[1]).toBe("blurred");
        expect(hints.at(-1)).toBe("ready");
    });

    it("refuses a card that is out of focus however it is held", () => {
        expect(run([good({ sharpness: 20 }), good({ sharpness: 20 })])).toEqual(["blurred", "blurred"]);
    });

    it("keeps the sharpness peak across a single detection blink", () => {
        expect(run([good({ sharpness: 900 }), null, good({ sharpness: 300 })])).toEqual([
            "ready",
            "no-card",
            "blurred",
        ]);
    });

    it("starts fresh once the card has really gone", () => {
        expect(run([good({ sharpness: 900 }), null, null, good({ sharpness: 300 })])).toEqual([
            "ready",
            "no-card",
            "no-card",
            "ready",
        ]);
    });

    it("starts fresh when a different card is put in its place", () => {
        expect(
            run([good({ sharpness: 900 }), good({ sharpness: 300, motion: 0.4 }), good({ sharpness: 300 })]),
        ).toEqual(["ready", "moving", "ready"]);
        expect(run([good({ sharpness: 900 }), good({ sharpness: 300 }), good({ sharpness: 300 })])).toEqual([
            "ready",
            "blurred",
            "blurred",
        ]);
    });

    it("forgets everything on reset", () => {
        const gate = createFrameGate();
        gate.observe(good({ sharpness: 900 }), quad);
        gate.reset();
        expect(gate.previousQuad).toBeNull();
        expect(gate.observe(good({ sharpness: 300 }), quad)).toEqual([]);
    });

    it("remembers where the card was so the next frame can measure movement", () => {
        const gate = createFrameGate();
        expect(gate.previousQuad).toBeNull();
        gate.observe(good(), quad);
        expect(gate.previousQuad).toBe(quad);
        gate.missed();
        expect(gate.previousQuad).toBeNull();
    });

    it("reports framing before light and light before stillness", () => {
        expect(shortcomingsOf(good({ areaFraction: 0.1, exposure: { mean: 20, clipped: 0.2 }, motion: 0.1 }))).toEqual([
            "closer",
            "glare",
            "dark",
            "moving",
        ]);
    });
});
