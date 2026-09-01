import { describe, expect, test } from "vitest";
import {
    DEFAULT_TARGETS,
    MAX_CORRIDOR,
    bucketRanges,
    curveCounts,
    curvePoints,
    heldTargets,
    isDefault,
    targetsKey,
    typeRanges,
    withCorridor,
    withCurve,
    withTypeCorridor,
    withoutCurve,
} from "src/utils/deck-targets";

describe("the curve shape", () => {
    test("counts are stored as shares, so a resized deck keeps the shape", () => {
        const shaped = withCurve(DEFAULT_TARGETS, [0, 10, 10, 10, 5, 5, 0]);

        expect(shaped.curve?.[1]).toBeCloseTo(0.25);
        expect(curveCounts(shaped, 40)).toEqual([0, 10, 10, 10, 5, 5, 0]);
        expect(curveCounts(shaped, 80)).toEqual([0, 20, 20, 20, 10, 10, 0]);
    });

    test("the shape is what is sent, and it sums to one", () => {
        const shaped = withCurve(DEFAULT_TARGETS, [1, 1, 1, 1, 1, 1, 1]);
        const points = curvePoints(shaped);

        expect(points).toHaveLength(7);
        expect(points.reduce((sum, point) => sum + point.share, 0)).toBeCloseTo(1);
        expect(points[6]).toEqual({ mv: 6, share: 1 / 7 });
    });

    test("an empty shape is no shape at all", () => {
        expect(withCurve(DEFAULT_TARGETS, [0, 0, 0, 0, 0, 0, 0])).toEqual(DEFAULT_TARGETS);
        expect(curveCounts(DEFAULT_TARGETS, 60)).toBeNull();
        expect(curvePoints(DEFAULT_TARGETS)).toEqual([]);
        expect(isDefault(withoutCurve(withCurve(DEFAULT_TARGETS, [1, 2, 3, 4, 5, 6, 7])))).toBe(true);
    });

    test("a short or negative shape is refused rather than half-applied", () => {
        expect(withCurve(DEFAULT_TARGETS, [1, 1]).curve).toEqual([1 / 2, 1 / 2, 0, 0, 0, 0, 0]);
        expect(withCurve(DEFAULT_TARGETS, [-5, 5, 0, 0, 0, 0, 0]).curve?.[0]).toBe(0);
    });
});

describe("the request key", () => {
    test("moving a target asks a different question", () => {
        const plain = targetsKey(DEFAULT_TARGETS);
        const moved = targetsKey(withCorridor(DEFAULT_TARGETS, "ramp", { low: 12, high: 16 }));
        const shaped = targetsKey(withCurve(DEFAULT_TARGETS, [0, 10, 10, 10, 5, 5, 0]));
        const typed = targetsKey(withTypeCorridor(DEFAULT_TARGETS, "Land", { low: 32, high: 34 }));

        expect(new Set([plain, moved, shaped, typed]).size).toBe(4);
    });

    test("a type corridor and a bucket of the same numbers are different questions", () => {
        expect(targetsKey(withTypeCorridor(DEFAULT_TARGETS, "Land", { low: 1, high: 2 }))).not.toBe(
            targetsKey(withCorridor(DEFAULT_TARGETS, "ramp", { low: 1, high: 2 })),
        );
    });

    test("the order types were moved in is not part of the question", () => {
        const one = withTypeCorridor(withTypeCorridor(DEFAULT_TARGETS, "Land", { low: 1, high: 2 }), "Creature", {
            low: 3,
            high: 4,
        });
        const other = withTypeCorridor(withTypeCorridor(DEFAULT_TARGETS, "Creature", { low: 3, high: 4 }), "Land", {
            low: 1,
            high: 2,
        });

        expect(targetsKey(one)).toBe(targetsKey(other));
        expect(typeRanges(one)).toEqual(typeRanges(other));
    });

    test("handles dragged past each other are sorted before they are sent", () => {
        expect(typeRanges(withTypeCorridor(DEFAULT_TARGETS, "Land", { low: 34, high: 32 }))).toEqual([
            { type: "Land", low: 32, high: 34 },
        ]);
        expect(typeRanges(DEFAULT_TARGETS)).toEqual([]);
    });

    test("the order buckets were moved in is not part of the question", () => {
        const one = withCorridor(withCorridor(DEFAULT_TARGETS, "ramp", { low: 1, high: 2 }), "card_draw", {
            low: 3,
            high: 4,
        });
        const other = withCorridor(withCorridor(DEFAULT_TARGETS, "card_draw", { low: 3, high: 4 }), "ramp", {
            low: 1,
            high: 2,
        });

        expect(targetsKey(one)).toBe(targetsKey(other));
        expect(bucketRanges(one)).toEqual(bucketRanges(other));
    });
});

describe("the corridor ceiling", () => {
    test("a corridor is held inside what the service will take", () => {
        const moved = withCorridor(DEFAULT_TARGETS, "interaction", { low: 9.8, high: 5550 });

        expect(moved.buckets["interaction"]).toEqual({ low: 9.8, high: MAX_CORRIDOR });
        expect(withTypeCorridor(DEFAULT_TARGETS, "Land", { low: -4, high: 300 }).types["Land"]).toEqual({
            low: 0,
            high: MAX_CORRIDOR,
        });
    });

    test("a document saved before the ceiling existed is held as it is read", () => {
        const saved = {
            ...DEFAULT_TARGETS,
            buckets: { interaction: { low: 9.8, high: 5550 } },
            types: { Land: { low: 34, high: 36 } },
        };
        const read = heldTargets(saved);

        expect(read.buckets["interaction"]).toEqual({ low: 9.8, high: MAX_CORRIDOR });
        // Untouched where it was already inside — the same corridor comes
        // back, so nothing is quietly rewritten on the next save.
        expect(read.types["Land"]).toEqual({ low: 34, high: 36 });
    });

    test("targets saved before the ceiling existed are held on the way out", () => {
        // Straight into the document, the way a settings answer from the
        // server arrives: the deck is already broken, and asking for advice
        // is the only way back to a panel with a reset button on it.
        const saved = {
            ...DEFAULT_TARGETS,
            buckets: { interaction: { low: 9.8, high: 5550 } },
            types: { Land: { low: 34, high: 4200 } },
        };

        expect(bucketRanges(saved)).toEqual([{ bucket: "interaction", low: 9.8, high: MAX_CORRIDOR }]);
        expect(typeRanges(saved)).toEqual([{ type: "Land", low: 34, high: MAX_CORRIDOR }]);
    });
});
