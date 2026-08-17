import { describe, expect, it } from "vitest";
import type { HandOutcome } from "src/utils/deck-odds";
import { afterFreeMulligan } from "src/utils/deck-odds";

const CHANCES = [0.1, 0.2, 0.3, 0.2, 0.1, 0.05, 0.03, 0.02];

const FIRST: HandOutcome = {
    distribution: CHANCES.map((chance, lands) => ({ lands, chance })),
    keepable: 0.6,
    summary: [
        { verdict: "screwed", chance: 0.3 },
        { verdict: "half", chance: 0.3 },
        { verdict: "good", chance: 0.3 },
        { verdict: "flooded", chance: 0.1 },
    ],
};

describe("afterFreeMulligan", () => {
    it("stays a distribution", () => {
        const total = afterFreeMulligan(FIRST).distribution.reduce((sum, entry) => sum + entry.chance, 0);
        expect(total).toBeCloseTo(1, 10);
    });

    it("keeps a hand as often as two tries allow", () => {
        expect(afterFreeMulligan(FIRST).keepable).toBeCloseTo(1 - (1 - FIRST.keepable) ** 2, 10);
    });

    it("leaves the bad hands only as the second draw", () => {
        const mulliganed = afterFreeMulligan(FIRST);
        const screwed = mulliganed.distribution
            .filter((entry) => entry.lands < 2)
            .reduce((sum, entry) => sum + entry.chance, 0);
        expect(screwed).toBeCloseTo(0.3 * (1 - FIRST.keepable), 10);
    });

    it("finds a land more often after the mulligan", () => {
        const before = FIRST.distribution[0]?.chance ?? 0;
        const after = afterFreeMulligan(FIRST).distribution[0]?.chance ?? 0;
        expect(after).toBeLessThan(before);
    });

    it("changes nothing when every hand is keepable", () => {
        const certain: HandOutcome = {
            distribution: [{ lands: 3, chance: 1 }],
            keepable: 1,
            summary: [
                { verdict: "screwed", chance: 0 },
                { verdict: "half", chance: 0 },
                { verdict: "good", chance: 1 },
                { verdict: "flooded", chance: 0 },
            ],
        };
        expect(afterFreeMulligan(certain).distribution).toStrictEqual(certain.distribution);
    });
});
