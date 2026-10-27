import { describe, expect, it } from "vitest";
import { matchStartingLife, matchLifeStorageKey, lifeResultDraft } from "./match-life";
import {
    createLifeHistory,
    changeLifeHistory,
    endLifeGame,
    nextLifeGame,
    saveLifeHistory,
    loadLifeHistory,
} from "./life-history";

describe("Match counting defaults", () => {
    it("suggests format totals without imposing them on counted Games", () => {
        expect(
            [
                "commander",
                "predh",
                "paupercommander",
                "oathbreaker",
                "duel",
                "archon",
                "standardbrawl",
                "brawl",
                "competitivebrawl",
                "standard",
            ].map((format) => matchStartingLife(format, 2)),
        ).toEqual([40, 40, 30, 20, 20, 20, 25, 25, 25, 20]);
        expect(matchStartingLife("standardbrawl", 4)).toBe(30);
        expect(matchStartingLife(null, 2)).toBe(20);
        expect(matchStartingLife(null, 4)).toBe(40);
    });
});

it("restores only the selected Match and never the standalone table", () => {
    const values = new Map<string, string>();
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
    const players = [
        { id: "a", name: "Alice" },
        { id: "b", name: "Bob" },
    ];
    const counted = changeLifeHistory(createLifeHistory(players, [25, 25]), 0, -3);
    saveLifeHistory(matchLifeStorageKey("event", "table-1"), counted, storage);
    expect(loadLifeHistory(matchLifeStorageKey("event", "table-1"), storage)?.games[0].life).toEqual([22, 25]);
    expect(loadLifeHistory(matchLifeStorageKey("event", "table-2"), storage)).toBeNull();
    expect(loadLifeHistory(matchLifeStorageKey("another", "table-1"), storage)).toBeNull();
    expect(loadLifeHistory("cardlens.life-history.v1", storage)).toBeNull();
});

it("prefills an explicit Result draft only from completed Games, irrespective of life totals", () => {
    const players = [
        { id: "a", name: "Alice" },
        { id: "b", name: "Bob" },
    ];
    let history = changeLifeHistory(createLifeHistory(players, [20, 20]), 1, -20);
    expect(lifeResultDraft(history, ["a", "b"])).toBeNull();
    history = endLifeGame(history, { winner: "b" });
    expect(lifeResultDraft(history, ["a", "b"])).toEqual({ games_won: [0, 1], games_drawn: 0 });
    expect(lifeResultDraft(history, ["b", "a"])).toEqual({ games_won: [1, 0], games_drawn: 0 });
    history = nextLifeGame(history, players, [20, 20]);
    history = endLifeGame(history, { draw: true });
    history = nextLifeGame(history, players, [20, 20]);
    history = endLifeGame(history, { winner: "a" });
    expect(lifeResultDraft(history, ["a", "b"])).toEqual({ games_won: [1, 1], games_drawn: 1 });
    expect(lifeResultDraft(history, ["b", "a"])).toEqual({ games_won: [1, 1], games_drawn: 1 });
});
