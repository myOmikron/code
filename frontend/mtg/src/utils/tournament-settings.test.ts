import { describe, expect, it } from "vitest";
import { Ruleset, TopCut } from "src/api/generated";
import {
    formatDefaults,
    withFormatDefaults,
    fromLocalInput,
    rulesetFits,
    rulesetsFor,
    toLocalInput,
    topCutsFor,
} from "src/utils/tournament-settings";

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

describe("topCutsFor", () => {
    it("offers a Top 4 or Top 8 one-on-one", () => {
        expect(topCutsFor(2)).toEqual([TopCut.Top4, TopCut.Top8]);
    });

    it("offers the final Match multiplayer", () => {
        for (const size of [3, 4, 5]) {
            expect(topCutsFor(size)).toEqual([TopCut.Final]);
        }
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

describe("deck format suggestions", () => {
    it("suggests multiplayer for its four formats and for no format", () => {
        for (const format of [null, "commander", "predh", "paupercommander", "oathbreaker"]) {
            expect(formatDefaults(format)).toEqual({ tableSize: 4, ruleset: Ruleset.TopDeck });
        }
        for (const format of ["standard", "duel", "archon", "brawl", "competitivebrawl", "standardbrawl"]) {
            expect(formatDefaults(format)).toEqual({ tableSize: 2, ruleset: Ruleset.Mtr });
        }
    });
});

describe("changing format", () => {
    it("updates automatic settings and preserves valid manual choices and loaded settings", () => {
        expect(
            withFormatDefaults({ tableSize: 4, ruleset: Ruleset.TopDeck }, "standard", {
                tableSize: false,
                ruleset: false,
            }),
        ).toEqual({ tableSize: 2, ruleset: Ruleset.Mtr });
        expect(
            withFormatDefaults({ tableSize: 3, ruleset: Ruleset.MultiplayerAddendum }, "standard", {
                tableSize: true,
                ruleset: true,
            }),
        ).toEqual({ tableSize: 3, ruleset: Ruleset.MultiplayerAddendum });
        expect(
            withFormatDefaults({ tableSize: 4, ruleset: Ruleset.MultiplayerAddendum }, "standard", {
                tableSize: false,
                ruleset: true,
            }),
        ).toEqual({ tableSize: 2, ruleset: Ruleset.Mtr });
        expect(
            withFormatDefaults({ tableSize: 2, ruleset: Ruleset.Mtr }, "commander", { tableSize: true, ruleset: true }),
        ).toEqual({ tableSize: 2, ruleset: Ruleset.Mtr });
    });
});
