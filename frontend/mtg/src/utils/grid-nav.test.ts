import { describe, expect, it } from "vitest";
import { stepHighlight } from "src/utils/grid-nav";

describe("stepHighlight", () => {
    // A 3-wide grid of 8 items lays out 3 + 3 + 2 — the partial last row is
    // what makes "clamp to the last item" worth testing on its own.
    const columns = 3;
    const length = 8;

    it("engages at 0 on Down from an unengaged highlight", () => {
        expect(stepHighlight(null, "ArrowDown", columns, length)).toBe(0);
    });

    it("leaves Up/Left/Right alone while unengaged, for the text caret", () => {
        expect(stepHighlight(null, "ArrowUp", columns, length)).toBeNull();
        expect(stepHighlight(null, "ArrowLeft", columns, length)).toBeNull();
        expect(stepHighlight(null, "ArrowRight", columns, length)).toBeNull();
    });

    it("steps Down a full row at a time", () => {
        expect(stepHighlight(0, "ArrowDown", columns, length)).toBe(3);
        expect(stepHighlight(3, "ArrowDown", columns, length)).toBe(6);
    });

    it("clamps Down to the last item so a partial row is still reachable", () => {
        expect(stepHighlight(6, "ArrowDown", columns, length)).toBe(7);
    });

    it("steps Up a full row at a time until it releases out of the top row", () => {
        expect(stepHighlight(7, "ArrowUp", columns, length)).toBe(4);
        expect(stepHighlight(4, "ArrowUp", columns, length)).toBe(1);
        expect(stepHighlight(1, "ArrowUp", columns, length)).toBeNull();
    });

    it("clamps Right at the last item and Left at the first", () => {
        expect(stepHighlight(7, "ArrowRight", columns, length)).toBe(7);
        expect(stepHighlight(0, "ArrowLeft", columns, length)).toBe(0);
    });

    it("answers null for every key once the list is empty", () => {
        expect(stepHighlight(0, "ArrowDown", columns, 0)).toBeNull();
        expect(stepHighlight(0, "ArrowUp", columns, 0)).toBeNull();
        expect(stepHighlight(0, "ArrowLeft", columns, 0)).toBeNull();
        expect(stepHighlight(0, "ArrowRight", columns, 0)).toBeNull();
        expect(stepHighlight(null, "ArrowDown", columns, 0)).toBeNull();
    });

    it("steps from the clamped position when a stale index outlived the list shrinking", () => {
        // active=7 no longer exists once the list is down to 5 items; the step
        // must land relative to the clamped current position (4), not index 7.
        expect(stepHighlight(7, "ArrowLeft", columns, 5)).toBe(3);
        expect(stepHighlight(7, "ArrowRight", columns, 5)).toBe(4);
        expect(stepHighlight(7, "ArrowDown", columns, 5)).toBe(4);
    });
});
