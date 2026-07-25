import { describe, expect, it } from "vitest";
import { observeReplacement, thumbDiff } from "./liveScanGate";

const OPTIONS = { motionThreshold: 28, changeDiff: 12 };
const thumb = (value: number) => new Float32Array(24 * 33).fill(value);
const steady = (luma: Float32Array) => ({ present: true, motion: 3, luma });

describe("live scan replacement gate", () => {
  it("keeps waiting while the added card is still sitting in the guide", () => {
    const added = thumb(120);
    // Same card, slight hand jitter: neither moving enough nor looking different.
    const result = observeReplacement({ present: true, motion: 4, luma: thumb(121) }, added, false, OPTIONS);
    expect(result.replaced).toBe(false);
    expect(result.disturbed).toBe(false);
  });

  it("releases as soon as the next card of a stack shows up in the same place", () => {
    // The regression: no empty frame and no big motion is ever observed, the guide just shows a
    // different card. The old removal counter never completed here.
    const result = observeReplacement(steady(thumb(180)), thumb(120), false, OPTIONS);
    expect(result.replaced).toBe(true);
  });

  it("releases on an emptied guide", () => {
    const result = observeReplacement({ present: false, motion: 2, luma: thumb(20) }, thumb(120), false, OPTIONS);
    expect(result.replaced).toBe(true);
  });

  it("lets a second identical copy through via the sticky disturbance flag", () => {
    const added = thumb(120);
    // The swap is seen once …
    const during = observeReplacement({ present: true, motion: 90, luma: thumb(60) }, added, false, OPTIONS);
    expect(during.disturbed).toBe(true);
    // … and the identical copy that settles afterwards still counts as a new card, even though it
    // looks exactly like the one just added.
    const after = observeReplacement(steady(added), added, during.disturbed, OPTIONS);
    expect(after.replaced).toBe(true);
  });

  it("does not lose a disturbance that falls between two samples", () => {
    const added = thumb(120);
    let disturbed = false;
    // A single moving sample, then several steady ones showing the same picture again.
    for (const motion of [70, 2, 2, 2]) {
      ({ disturbed } = observeReplacement({ present: true, motion, luma: added }, added, disturbed, OPTIONS));
    }
    expect(disturbed).toBe(true);
  });

  it("treats mismatched thumbnails as maximally different rather than crashing", () => {
    expect(thumbDiff(new Float32Array(4), new Float32Array(8))).toBe(Infinity);
  });
});
