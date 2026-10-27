import { describe, expect, it } from "vitest";
import {
    createLifeHistory,
    changeLifeHistory,
    endLifeGame,
    nextLifeGame,
    groupLifeEvents,
    correctLifeEvent,
    saveLifeHistory,
    loadLifeHistory,
    changeCommanderHistory,
} from "./life-history";
const players = [
    { id: "a", name: "Alice" },
    { id: "b", name: "Bob" },
];
describe("local Life history", () => {
    it("keeps Games, outcomes and starting totals through reload without expiring", () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                values.set(key, value);
            },
        };
        let history = createLifeHistory(players, [20, 30], 100);
        history = changeLifeHistory(history, 0, -3, 200);
        history = endLifeGame(history, { winner: "a" }, 300);
        history = nextLifeGame(history, players, [20, 30], 400);
        saveLifeHistory("test", history, storage);
        const restored = loadLifeHistory("test", storage)!;
        expect(restored.games[0].outcome).toEqual({ winner: "a" });
        expect(restored.games[0].life).toEqual([17, 30]);
        expect(restored.games[1].life).toEqual([20, 30]);
        expect(restored.games[1].damage).toEqual([
            [0, 0],
            [0, 0],
        ]);
        expect(restored.games[0].events[0]).toMatchObject({ kind: "start", at: 100 });
    });
});

it("groups taps for reading but retains an explicit correction", () => {
    let history = createLifeHistory(players, [40, 40], 100);
    history = changeLifeHistory(history, 0, -1, 200);
    history = changeLifeHistory(history, 0, -1, 400);
    history = changeLifeHistory(history, 0, -1, 600);
    expect(groupLifeEvents(history.games[0].events).map((event) => event.amount)).toEqual([undefined, -3]);
    history = correctLifeEvent(history, history.games[0].events[2].id, 800);
    expect(history.games[0].life).toEqual([38, 40]);
    expect(history.games[0].events.at(-1)).toMatchObject({ kind: "correction", amount: 1 });
    expect(history.games[0].events).toHaveLength(5);
    expect(correctLifeEvent(history, history.games[0].events[2].id, 900)).toBe(history);
});

it("reclassifies a recent hit once and corrects commander damage with life consistently", () => {
    let history = createLifeHistory(players, [40, 40], 100);
    history = changeLifeHistory(history, 0, -3, 200);
    history = changeCommanderHistory(history, 0, 1, 3, true, 300);
    expect(history.games[0].life).toEqual([37, 40]);
    expect(history.games[0].damage[0]).toEqual([0, 3]);
    expect(changeCommanderHistory(history, 0, 1, 3, true, 400)).toBe(history);
    history = changeCommanderHistory(history, 0, 1, -1, false, 500);
    expect(history.games[0].life).toEqual([38, 40]);
    expect(history.games[0].damage[0]).toEqual([0, 2]);
    history = correctLifeEvent(history, history.games[0].events.at(-1)!.id, 600);
    expect(history.games[0].life).toEqual([37, 40]);
    expect(history.games[0].damage[0]).toEqual([0, 3]);
});

it("ignores corrupt storage and continues counting when storage is denied", () => {
    const invalid = {
        getItem: () =>
            JSON.stringify({
                version: 1,
                games: [
                    {
                        players,
                        life: [40, 40],
                        startingLife: [40, 40],
                        damage: [
                            [0, 0],
                            [0, 0],
                        ],
                        events: [{ id: "broken", kind: "life", at: 100, player: "missing", amount: "bad" }],
                    },
                ],
            }),
        setItem: () => {},
    };
    expect(loadLifeHistory("test", invalid)).toBeNull();
    const denied = {
        getItem: () => {
            throw new Error("denied");
        },
        setItem: () => {
            throw new Error("denied");
        },
    };
    expect(loadLifeHistory("test", denied)).toBeNull();
    expect(() => saveLifeHistory("test", createLifeHistory(players, [40, 40]), denied)).not.toThrow();
});

it("corrects a reclassified life hit together with its commander tally", () => {
    let history = createLifeHistory(players, [40, 40], 100);
    history = changeLifeHistory(history, 0, -3, 200);
    const hit = history.games[0].events.at(-1)!;
    history = changeCommanderHistory(history, 0, 1, 3, true, 300);
    history = correctLifeEvent(history, hit.id, 400);
    expect(history.games[0].life).toEqual([40, 40]);
    expect(history.games[0].damage[0]).toEqual([0, 0]);
});
