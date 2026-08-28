import { afterEach, describe, expect, it, vi } from "vitest";
import type { LifeTrackerSettings } from "src/utils/life-tracker";
import {
    DEFAULT_LIFE_TRACKER_SETTINGS,
    emptyCommanderDamage,
    isEliminated,
    loadLifeTrackerGame,
    loadLifeTrackerSettings,
    opponentOrder,
    resizeCommanderDamage,
    saveLifeTrackerGame,
    saveLifeTrackerSettings,
    seatingFor,
} from "src/utils/life-tracker";

afterEach(() => vi.unstubAllGlobals());

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

describe("life tracker seating", () => {
    it("seats one player per edge in the cross, whichever way round the screen lies", () => {
        for (const orientation of ["landscape", "portrait"] as const) {
            const cross = seatingFor(4, "cross", orientation);

            expect(cross.seats.map((placement) => placement.seat)).toEqual(["left", "top", "right", "bottom"]);
            expect(cross.flush).toBe(true);
        }
    });

    it("collides the middle pair sideways and lays the others on the edges", () => {
        const [first, second, third, fourth] = seatingFor(4, "cross", "landscape").seats;

        expect(first.area).toBe("col-start-1 row-start-2");
        expect(third.area).toBe("col-start-2 row-start-2");
        expect(second.area).toBe("col-span-2 row-start-1");
        expect(fourth.area).toBe("col-span-2 row-start-3");
    });

    it("falls back to the sides for pods the cross was not built for", () => {
        expect(seatingFor(3, "cross", "landscape")).toEqual(seatingFor(3, "sides", "landscape"));
        expect(seatingFor(6, "cross", "portrait")).toEqual(seatingFor(6, "sides", "portrait"));
    });

    it("reads a wide screen across it", () => {
        expect(seatingFor(3, "sides", "landscape").seats.map((placement) => placement.seat)).toEqual([
            "top",
            "bottom",
            "bottom",
        ]);
        expect(seatingFor(4, "sides", "landscape").seats.map((placement) => placement.seat)).toEqual([
            "top",
            "top",
            "bottom",
            "bottom",
        ]);
    });

    it("turns the tiles that stand tall on an upright screen", () => {
        const three = seatingFor(3, "sides", "portrait");

        expect(three.seats.map((placement) => placement.seat)).toEqual(["top", "right", "left"]);
        expect(three.seats.map((placement) => placement.area)).toEqual([
            "col-span-2 row-start-1",
            "col-start-2 row-start-2",
            "col-start-1 row-start-2",
        ]);
    });

    it("keeps a full-width row read from the near edge", () => {
        for (const orientation of ["landscape", "portrait"] as const) {
            expect(seatingFor(2, "sides", orientation).seats.map((placement) => placement.seat)).toEqual([
                "top",
                "bottom",
            ]);
        }
        expect(seatingFor(5, "sides", "portrait").seats[3]?.seat).toBe("bottom");
    });

    it("turns the side seats and keeps them apart", () => {
        const sides = seatingFor(4, "sides", "portrait");

        expect(sides.seats.map((placement) => placement.seat)).toEqual(["left", "right", "right", "left"]);
        expect(sides.flush).toBe(false);
    });

    it("counts the side seats clockwise from the top left", () => {
        expect(seatingFor(4, "sides", "portrait").seats.map((placement) => placement.area)).toEqual([
            "col-start-1 row-start-1",
            "col-start-2 row-start-1",
            "col-start-2 row-start-2",
            "col-start-1 row-start-2",
        ]);
        expect(seatingFor(6, "sides", "portrait").seats.map((placement) => placement.area)).toEqual([
            "col-start-1 row-start-1",
            "col-start-2 row-start-1",
            "col-start-2 row-start-2",
            "col-start-2 row-start-3",
            "col-start-1 row-start-3",
            "col-start-1 row-start-2",
        ]);
        expect(seatingFor(6, "sides", "landscape").seats.map((placement) => placement.area)).toEqual([
            "col-start-1 row-start-1",
            "col-start-2 row-start-1",
            "col-start-3 row-start-1",
            "col-start-3 row-start-2",
            "col-start-2 row-start-2",
            "col-start-1 row-start-2",
        ]);
    });

    it("places one tile per player", () => {
        for (const orientation of ["landscape", "portrait"] as const) {
            for (const count of [2, 3, 4, 5, 6]) {
                expect(seatingFor(count, "sides", orientation).seats).toHaveLength(count);
            }
        }
    });
});

describe("commander damage order", () => {
    it("reads the cross left to right from every edge", () => {
        const { seats } = seatingFor(4, "cross", "landscape");

        expect(opponentOrder(seats, 3)).toEqual([0, 1, 2]);
        expect(opponentOrder(seats, 1)).toEqual([2, 3, 0]);
        expect(opponentOrder(seats, 0)).toEqual([1, 2, 3]);
        expect(opponentOrder(seats, 2)).toEqual([3, 0, 1]);
    });

    it("turns the order round for the players facing the other way", () => {
        const { seats } = seatingFor(4, "sides", "landscape");

        expect(opponentOrder(seats, 3)).toEqual([0, 1, 2]);
        expect(opponentOrder(seats, 0)).toEqual([2, 1, 3]);
    });

    it("reads a portrait pod along the screen, far side first", () => {
        const { seats } = seatingFor(6, "sides", "portrait");

        expect(opponentOrder(seats, 0)).toEqual([1, 2, 5, 3, 4]);
    });

    it("leaves every player out of their own order", () => {
        for (const orientation of ["landscape", "portrait"] as const) {
            for (const count of [2, 3, 4, 5, 6]) {
                const { seats } = seatingFor(count, "sides", orientation);

                for (let player = 0; player < count; player++) {
                    const order = opponentOrder(seats, player);

                    expect(order).not.toContain(player);
                    expect(new Set(order).size).toBe(count - 1);
                }
            }
        }
    });
});

describe("life tracker settings", () => {
    it("keeps a stored setup", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", storage(values));

        saveLifeTrackerSettings({
            startingLife: 20,
            playerCount: 2,
            arrangement: "cross",
        });

        expect(loadLifeTrackerSettings()).toEqual({
            startingLife: 20,
            playerCount: 2,
            arrangement: "cross",
        });
    });

    it("keeps a typed starting total", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", storage(values));

        saveLifeTrackerSettings({
            startingLife: 13,
            playerCount: 4,
            arrangement: "sides",
        });

        expect(loadLifeTrackerSettings().startingLife).toBe(13);
    });

    it("replaces invalid stored fields with defaults", () => {
        const values = new Map([
            ["cardlens.life-tracker.v1", JSON.stringify({ startingLife: 0, playerCount: 9, arrangement: "circle" })],
        ]);
        vi.stubGlobal("localStorage", storage(values));

        expect(loadLifeTrackerSettings()).toEqual(DEFAULT_LIFE_TRACKER_SETTINGS);
    });

    it("opens on the defaults without stored settings", () => {
        vi.stubGlobal("localStorage", storage(new Map()));

        expect(loadLifeTrackerSettings()).toEqual(DEFAULT_LIFE_TRACKER_SETTINGS);
    });
});

describe("resuming a game", () => {
    const POD: LifeTrackerSettings = { startingLife: 40, playerCount: 4, arrangement: "sides" };

    /**
     * Puts a table into storage as if it had been left there
     *
     * @param game what was stored under the game key
     *
     * @returns the backing store, for asserting on what was written
     */
    function stored(game: unknown): Map<string, string> {
        const values = new Map([["cardlens.life-tracker.game.v1", JSON.stringify(game)]]);
        vi.stubGlobal("localStorage", storage(values));
        return values;
    }

    it("carries on with the totals and the damage the table was on", () => {
        vi.stubGlobal("localStorage", storage(new Map()));
        const damage = [
            [0, 7, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 21],
            [0, 0, 0, 0],
        ];

        saveLifeTrackerGame({ life: [33, 40, 19, 40], damage, deltas: { 2: -21 } });

        expect(loadLifeTrackerGame(POD)).toEqual({ life: [33, 40, 19, 40], damage, deltas: {} });
    });

    it("starts fresh when nothing was left behind", () => {
        vi.stubGlobal("localStorage", storage(new Map()));

        expect(loadLifeTrackerGame(POD)).toBeNull();
    });

    it("forgets a game old enough to be over", () => {
        const day = 24 * 60 * 60 * 1000;
        stored({ life: [12, 3, 40, 8], damage: emptyCommanderDamage(4), at: Date.now() - day });

        expect(loadLifeTrackerGame(POD)).toBeNull();
    });

    it("keeps a game from earlier the same evening", () => {
        const hours = 4 * 60 * 60 * 1000;
        stored({ life: [12, 3, 40, 8], damage: emptyCommanderDamage(4), at: Date.now() - hours });

        expect(loadLifeTrackerGame(POD)?.life).toEqual([12, 3, 40, 8]);
    });

    it("fits a stored table to a pod that has since shrunk", () => {
        stored({
            life: [33, 40, 19, 40],
            damage: [
                [0, 7, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 21],
                [0, 0, 0, 0],
            ],
            at: Date.now(),
        });

        expect(loadLifeTrackerGame({ ...POD, playerCount: 2 })).toEqual({
            life: [33, 40],
            damage: [
                [0, 7],
                [0, 0],
            ],
            deltas: {},
        });
    });

    it("seats a player the stored table did not have on the starting total", () => {
        stored({ life: [33, 12], damage: emptyCommanderDamage(2), at: Date.now() });

        expect(loadLifeTrackerGame(POD)?.life).toEqual([33, 12, 40, 40]);
    });

    it("keeps a table that was counted below zero", () => {
        stored({ life: [-3, 40, 40, 40], damage: emptyCommanderDamage(4), at: Date.now() });

        expect(loadLifeTrackerGame(POD)?.life).toEqual([-3, 40, 40, 40]);
    });

    it("refuses anything that does not read as a table", () => {
        const cases: Array<unknown> = [
            { life: [40, 40], damage: emptyCommanderDamage(2) },
            { life: [], damage: [], at: Date.now() },
            { life: [40, "40"], damage: emptyCommanderDamage(2), at: Date.now() },
            { life: [40, 20.5], damage: emptyCommanderDamage(2), at: Date.now() },
            { life: [40, 40], damage: emptyCommanderDamage(3), at: Date.now() },
            {
                life: [40, 40],
                damage: [
                    [0, 0, 0],
                    [0, 0],
                ],
                at: Date.now(),
            },
            {
                life: [40, 40],
                damage: [
                    [0, -7],
                    [0, 0],
                ],
                at: Date.now(),
            },
            { life: [40, 40], at: Date.now() },
            "not a game at all",
        ];

        for (const broken of cases) {
            stored(broken);
            expect(loadLifeTrackerGame(POD)).toBeNull();
        }
    });

    it("survives storage the browser will not hand out", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        });

        expect(() => saveLifeTrackerGame({ life: [40], damage: [[0]], deltas: {} })).not.toThrow();
        expect(loadLifeTrackerGame(POD)).toBeNull();
    });
});

describe("commander damage", () => {
    it("starts everyone on nothing taken", () => {
        expect(emptyCommanderDamage(3)).toEqual([
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
        ]);
    });

    it("keeps what the seated players took when a seat is added", () => {
        const dealt = [
            [0, 7],
            [21, 0],
        ];

        expect(resizeCommanderDamage(dealt, 3)).toEqual([
            [0, 7, 0],
            [21, 0, 0],
            [0, 0, 0],
        ]);
    });

    it("drops the seats that left", () => {
        const dealt = [
            [0, 7, 3],
            [21, 0, 1],
            [2, 4, 0],
        ];

        expect(resizeCommanderDamage(dealt, 2)).toEqual([
            [0, 7],
            [21, 0],
        ]);
    });
});

describe("elimination", () => {
    it("keeps a player in while they hold a total", () => {
        expect(isEliminated(1, [0, 20, 0])).toBe(false);
    });

    it("counts a player on nothing out", () => {
        expect(isEliminated(0, [0, 0, 0])).toBe(true);
        expect(isEliminated(-3, [0, 0, 0])).toBe(true);
    });

    it("counts a lethal helping from one commander out", () => {
        expect(isEliminated(17, [0, 21, 0])).toBe(true);
    });
});
