import { describe, expect, test } from "vitest";
import {
    DEFAULT_TARGETS,
    bucketRanges,
    curveCounts,
    curvePoints,
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
