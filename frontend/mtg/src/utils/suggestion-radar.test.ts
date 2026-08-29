import { describe, expect, test } from "vitest";
import { Provenance, Suggestion } from "src/api/graph-generated";
import { AXIS_ORDER, batchPeaks, exclusions, fusionBonus, suggestionRadar } from "src/utils/suggestion-radar";

/**
 * The smallest suggestion the radar can read
 *
 * @param provenance what argued for the card
 * @param score the fused total, defaulting to the sum of the provenance
 *
 * @returns the suggestion
 */
function suggestion(provenance: Array<Partial<Provenance>>, score?: number): Suggestion {
    const entries = provenance.map((entry) => ({ detail: "", ...entry })) as Array<Provenance>;
    return {
        oracle_id: "x",
        name: "x",
        cmc: 0,
        type_line: "",
        price_usd: null,
        score: score ?? entries.reduce((sum, entry) => sum + entry.score, 0),
        provenance: entries,
    };
}

describe("suggestionRadar axes", () => {
    test("returns all five axes in fixed order regardless of what fired", () => {
        const axes = suggestionRadar(suggestion([{ channel: "combo_completion", score: 1.8 }]), batchPeaks([]));

        expect(axes.map((axis) => axis.id)).toEqual(AXIS_ORDER);
    });

    test("theme and typal fold into one identity axis, summed", () => {
        const one = suggestion([
            { channel: "theme_fit", score: 0.6, key: "counters" },
            { channel: "typal_bridge", score: 0.5, key: "Angel" },
        ]);

        const identity = suggestionRadar(one, batchPeaks([one])).find((axis) => axis.id === "identity");

        expect(identity?.score).toBeCloseTo(1.1);
        expect(identity?.contributors).toEqual([
            { key: "counters", channel: "theme_fit", score: 0.6 },
            { key: "Angel", channel: "typal_bridge", score: 0.5 },
        ]);
    });

    test("a demotion never appears on an axis — a radar cannot draw negative length", () => {
        const one = suggestion([
            { channel: "theme_fit", score: 0.6, key: "counters" },
            { channel: "theme_excluded", score: -0.8, key: "stax" },
        ]);

        const identity = suggestionRadar(one, batchPeaks([one])).find((axis) => axis.id === "identity");

        expect(identity?.score).toBeCloseTo(0.6);
    });

    test("ignores a channel it does not know rather than growing an axis", () => {
        const axes = suggestionRadar(suggestion([{ channel: "vector_knn", score: 9 }]), batchPeaks([]));

        expect(axes).toHaveLength(AXIS_ORDER.length);
        expect(axes.every((axis) => axis.score === 0)).toBe(true);
    });

    test("normalises each axis against the batch peak, not a shared scale", () => {
        const batch = [
            suggestion([{ channel: "edhrec_synergy", score: 2.0 }]),
            suggestion([{ channel: "edhrec_synergy", score: 1.0 }]),
        ];

        const edhrec = suggestionRadar(batch[1], batchPeaks(batch)).find((axis) => axis.id === "edhrec_synergy");

        expect(edhrec?.value).toBeCloseTo(0.5);
        expect(edhrec?.score).toBe(1.0);
    });

    test("an axis nobody fired stays at zero instead of dividing by zero", () => {
        const batch = [suggestion([{ channel: "edhrec_synergy", score: 2.0 }])];
        const combo = suggestionRadar(batch[0], batchPeaks(batch)).find((axis) => axis.id === "combo_completion");

        expect(combo?.value).toBe(0);
        expect(Number.isNaN(combo?.value)).toBe(false);
    });

    test("an empty batch falls back to the suggestion itself", () => {
        const solo = suggestion([{ channel: "role_gap", score: 0.2 }]);

        expect(suggestionRadar(solo, batchPeaks([])).find((axis) => axis.id === "role_gap")?.value).toBe(1);
    });
});

describe("batchPeaks", () => {
    test("takes the strongest score per axis across the batch", () => {
        const batch = [
            suggestion([{ channel: "edhrec_synergy", score: 2.0 }]),
            suggestion([
                { channel: "edhrec_synergy", score: 1.0 },
                { channel: "role_gap", score: 0.4 },
            ]),
        ];

        expect(batchPeaks(batch)).toMatchObject({ edhrec_synergy: 2.0, role_gap: 0.4 });
    });

    test("zero-fills an empty batch rather than leaving axes missing", () => {
        expect(batchPeaks([])).toEqual(Object.fromEntries(AXIS_ORDER.map((id) => [id, 0])));
    });
});

describe("exclusions", () => {
    test("hands back the negative entries for the footnote", () => {
        const one = suggestion([
            { channel: "edhrec_synergy", score: 1.0 },
            { channel: "theme_excluded", score: -0.8, key: "stax", detail: "reads as Stax" },
        ]);

        expect(exclusions(one)).toEqual([
            { channel: "theme_excluded", score: -0.8, key: "stax", detail: "reads as Stax" },
        ]);
    });

    test("nothing negative, nothing returned", () => {
        expect(exclusions(suggestion([{ channel: "edhrec_synergy", score: 1.0 }]))).toEqual([]);
    });
});

describe("fusionBonus", () => {
    test("recovers the agreement bonus from the total", () => {
        const one = suggestion(
            [
                { channel: "edhrec_synergy", score: 1.0 },
                { channel: "theme_fit", score: 0.5 },
            ],
            2.0,
        );

        expect(fusionBonus(one)).toBeCloseTo(0.5);
    });

    test("survives a demotion in the sum", () => {
        const one = suggestion(
            [
                { channel: "edhrec_synergy", score: 1.0 },
                { channel: "theme_excluded", score: -0.4 },
            ],
            0.6,
        );

        expect(fusionBonus(one)).toBe(0);
    });

    test("reads float dust as no bonus", () => {
        // Real dust rather than a literal: 0.1 + 0.2 lands 5.6e-17 above 0.3,
        // which is exactly the difference the subtraction has to ignore.
        const one = suggestion([{ channel: "edhrec_synergy", score: 0.3 }], 0.1 + 0.2);

        expect(one.score).not.toBe(0.3);
        expect(fusionBonus(one)).toBe(0);
    });
});
