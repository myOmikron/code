import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    DEFAULT_TARGETS,
    bucketRanges,
    curveCounts,
    curvePoints,
    isDefault,
    readTargets,
    targetsKey,
    withCorridor,
    withCurve,
    withoutCorridor,
    withoutCurve,
    writeTargets,
} from "src/utils/deck-targets";

/**
 * A minimal localStorage implementation backed by the supplied map
 *
 * @param values the mutable key/value backing store
 *
 * @returns a Storage-compatible wrapper
 */
function storage(values: Map<string, string>): Storage {
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
        key: (index) => [...values.keys()][index] ?? null,
        /** @returns number of keys currently stored */
        get length() {
            return values.size;
        },
    };
}

describe("stored targets", () => {
    const values = new Map<string, string>();
    beforeEach(() => {
        values.clear();
        vi.stubGlobal("localStorage", storage(values));
    });
    afterEach(() => vi.unstubAllGlobals());

    test("a deck with nothing moved reads as the defaults", () => {
        expect(readTargets("deck")).toEqual(DEFAULT_TARGETS);
        expect(isDefault(DEFAULT_TARGETS)).toBe(true);
    });

    test("corridors survive a round trip, per deck", () => {
        writeTargets("one", withCorridor(DEFAULT_TARGETS, "ramp", { low: 12, high: 16 }));

        expect(readTargets("one").buckets.ramp).toEqual({ low: 12, high: 16 });
        expect(readTargets("two")).toEqual(DEFAULT_TARGETS);
    });

    test("a deck put back on its defaults leaves nothing behind", () => {
        writeTargets("one", withCorridor(DEFAULT_TARGETS, "ramp", { low: 12, high: 16 }));
        writeTargets("one", DEFAULT_TARGETS);

        expect(values.get("cardlens.deck-targets.v1")).toBe("{}");
    });

    test("handles dragged past each other are sorted, not rejected", () => {
        writeTargets("one", withCorridor(DEFAULT_TARGETS, "ramp", { low: 20, high: 8 }));

        expect(readTargets("one").buckets.ramp).toEqual({ low: 8, high: 20 });
    });

    test("junk in storage costs the entry, never the read", () => {
        values.set(
            "cardlens.deck-targets.v1",
            JSON.stringify({
                one: { buckets: { not_a_bucket: { low: 1, high: 2 }, ramp: "nonsense" }, curve: [1, 2] },
                two: { buckets: { ramp: { low: 3, high: 5 } }, curve: null },
            }),
        );

        expect(readTargets("one")).toEqual(DEFAULT_TARGETS);
        expect(readTargets("two").buckets.ramp).toEqual({ low: 3, high: 5 });
    });

    test("a released bucket goes back to following the bracket", () => {
        const edited = withCorridor(DEFAULT_TARGETS, "ramp", { low: 12, high: 16 });

        expect(isDefault(withoutCorridor(edited, "ramp"))).toBe(true);
    });
});

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

        expect(new Set([plain, moved, shaped]).size).toBe(3);
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
