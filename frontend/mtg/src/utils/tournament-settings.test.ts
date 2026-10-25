import { describe, expect, it } from "vitest";
import { Ruleset } from "src/api/generated";
import { fromLocalInput, rulesetFits, rulesetsFor, toLocalInput } from "src/utils/tournament-settings";

describe("rulesetsFor", () => {
    it("offers the MTR one-on-one only", () => {
        expect(rulesetsFor(2)).toEqual([Ruleset.Mtr]);
    });

    it("offers TopDeck and the Multiplayer Addendum at three to five", () => {
        for (const size of [3, 4, 5]) {
            expect(rulesetsFor(size)).toEqual([Ruleset.TopDeck, Ruleset.MultiplayerAddendum]);
        }
    });
});

describe("rulesetFits", () => {
    it("tells a Ruleset that fits the Table size from one that does not", () => {
        expect(rulesetFits(Ruleset.Mtr, 2)).toBe(true);
        expect(rulesetFits(Ruleset.Mtr, 4)).toBe(false);
        expect(rulesetFits(Ruleset.TopDeck, 2)).toBe(false);
        expect(rulesetFits(Ruleset.MultiplayerAddendum, 5)).toBe(true);
    });
});

describe("the start time field", () => {
    it("reads back the instant it was given", () => {
        const instant = new Date("2026-11-07T18:30:00Z");
        expect(fromLocalInput(toLocalInput(instant)).getTime()).toBe(instant.getTime());
    });

    it("shows minutes, the way a datetime-local field takes them", () => {
        expect(toLocalInput(new Date(2026, 10, 7, 18, 30, 45))).toBe("2026-11-07T18:30");
    });
});
