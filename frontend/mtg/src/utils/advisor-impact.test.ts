import { describe, expect, it } from "vitest";
import type { Diagnostics } from "src/api/graph-generated";
import { Dim, deckDims, impact, needs, plateaued, primaryType, roomFor } from "src/utils/advisor-impact";
import { shiftTargets } from "src/utils/advisor-directions";
import { DEFAULT_TARGETS } from "src/utils/deck-targets";

const report = {
    deck_size: 99,
    lands: 37,
    buckets: [
        { bucket: "ramp", coverage: 8, low: 10, high: 12, default_low: 10, default_high: 12 },
        { bucket: "interaction", coverage: 11, low: 7, high: 9, default_low: 7, default_high: 9 },
        { bucket: "card_draw", coverage: 10, low: 9, high: 11, default_low: 9, default_high: 11 },
    ],
    types: [
        { type: "Creature", count: 30, low: 28, high: 34, default_low: 28, default_high: 34 },
        { type: "Artifact", count: 8, low: 6, high: 9, default_low: 6, default_high: 9 },
        { type: "Sorcery", count: 6, low: 4, high: 8, default_low: 4, default_high: 8 },
        { type: "Land", count: 37, low: 36, high: 38, default_low: 36, default_high: 38 },
    ],
    curve: [0, 1, 2, 3, 4, 5, 6].map((mv) => ({ mv, count: mv === 5 ? 9 : 8, target: mv === 5 ? 5 : 8 })),
    themes: [{ theme: "tokens", label: "Tokens", share: 0.2, cards: 10 }],
} as unknown as Diagnostics;

const dims: Array<Dim> = deckDims(report, { levels: { tokens: "core" } }, ["tokens"], null);

const card = (type_line: string, cmc: number, buckets: Record<string, number> = {}, themes: Array<string> = []) => ({
    type_line,
    cmc,
    profile: { buckets, themes },
});

describe("primaryType", () => {
    it("files a card the way the service counts it", () => {
        expect(primaryType("Artifact Creature — Golem")).toBe("Creature");
        expect(primaryType("Land Creature — Forest Dryad")).toBe("Land");
        expect(primaryType("Kindred Instant — Elf")).toBe("Instant");
    });
});

describe("impact", () => {
    it("marks what moves toward a range good and what moves away warn", () => {
        const badges = impact(card("Artifact", 1, { ramp: 1, interaction: 1 }, ["tokens"]), null, dims);
        const tone = (key: string) => badges.find((b) => b.dim.key === key)?.tone;

        expect(tone("bucket:ramp")).toBe("good");
        expect(tone("theme:tokens")).toBe("good");
        expect(tone("bucket:interaction")).toBe("warn");
        expect(tone("type:Artifact")).toBeUndefined();
        expect(badges[0].tone).toBe("good");
    });

    it("nets out what both cards of a swap share", () => {
        const badges = impact(card("Creature", 2, { ramp: 1 }), card("Creature — Elf", 2, { ramp: 1 }), dims);

        expect(badges).toEqual([]);
    });

    it("drops fractions too small to name", () => {
        expect(impact(card("Sorcery", 3, { card_draw: 0.3 }), null, dims).map((b) => b.dim.key)).not.toContain(
            "bucket:card_draw",
        );
    });

    it("counts a land on no curve column", () => {
        const keys = impact(card("Land", 5), null, dims).map((b) => b.dim.key);

        expect(keys.some((key) => key.startsWith("curve:"))).toBe(false);
    });
});

describe("needs", () => {
    it("lists what is outside its range, themes first", () => {
        const keys = needs(dims).map((need) => `${need.up ? "+" : "-"}${need.dim.key}`);

        expect(keys).toEqual(["+theme:tokens", "+bucket:ramp", "-bucket:interaction", "-curve:5"]);
    });
});

describe("roomFor", () => {
    const signet = card("Artifact", 2, { ramp: 1 });
    const cuts = [
        card("Creature", 2, { ramp: 1 }),
        card("Sorcery", 5, { interaction: 1 }),
        card("Artifact", 2, {}, ["tokens"]),
    ];

    it("offers only swaps that help and hurt nothing", () => {
        const room = roomFor(signet, cuts, dims);

        expect(room.map((option) => option.cut)).toEqual([cuts[1]]);
        expect(room[0].badges.every((b) => b.tone !== "warn")).toBe(true);
    });

    it("reads a deck with no such swap as done", () => {
        expect(plateaued([signet], cuts, dims)).toBe(false);
        expect(plateaued([signet], [cuts[0]], dims)).toBe(true);
    });
});

describe("shiftTargets", () => {
    it("moves a range and takes it back to the default", () => {
        const shift = { buckets: { interaction: 3 }, types: { Land: 2 } };
        const moved = shiftTargets(DEFAULT_TARGETS, report, shift, 1);

        expect(moved.buckets.interaction).toEqual({ low: 10, high: 12 });
        expect(moved.types.Land).toEqual({ low: 38, high: 40 });

        const back = shiftTargets(
            moved,
            {
                ...report,
                buckets: report.buckets.map((b) => (b.bucket === "interaction" ? { ...b, low: 10, high: 12 } : b)),
                types: report.types?.map((t) => (t.type === "Land" ? { ...t, low: 38, high: 40 } : t)),
            } as Diagnostics,
            shift,
            -1,
        );
        expect(back.buckets.interaction).toBeUndefined();
        expect(back.types.Land).toBeUndefined();
    });
});
