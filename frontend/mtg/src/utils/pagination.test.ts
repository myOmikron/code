import { describe, expect, it } from "vitest";
import { pageWindow } from "src/utils/pagination";

describe("pageWindow", () => {
    it("offers every page while they all fit", () => {
        expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    it("has nothing to offer for an empty list", () => {
        expect(pageWindow(1, 0)).toEqual([]);
    });

    it("keeps both ends reachable from the middle", () => {
        expect(pageWindow(5, 220)).toEqual([1, null, 4, 5, 6, null, 220]);
    });

    it("drops the leading gap near the start", () => {
        expect(pageWindow(1, 220)).toEqual([1, 2, null, 220]);
        expect(pageWindow(3, 220)).toEqual([1, 2, 3, 4, null, 220]);
    });

    it("drops the trailing gap near the end", () => {
        expect(pageWindow(220, 220)).toEqual([1, null, 219, 220]);
    });

    it("shows a lone hidden page instead of an ellipsis for it", () => {
        // Without the rule this would be [1, null, 3, 4, 5] — an ellipsis that
        // takes the room of the page it hides.
        expect(pageWindow(4, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    it("clamps a page number that is out of range", () => {
        expect(pageWindow(999, 5)).toEqual(pageWindow(5, 5));
        expect(pageWindow(0, 5)).toEqual(pageWindow(1, 5));
    });

    it("widens with the radius", () => {
        expect(pageWindow(10, 220, 2)).toEqual([1, null, 8, 9, 10, 11, 12, null, 220]);
    });
});
