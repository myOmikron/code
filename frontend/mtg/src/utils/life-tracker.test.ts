import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_LIFE_TRACKER_SETTINGS,
    emptyCommanderDamage,
    isEliminated,
    loadLifeTrackerSettings,
    resizeCommanderDamage,
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
    it("seats one player per edge in the cross", () => {
        const cross = seatingFor(4, "cross");

        expect(cross.seats.map((placement) => placement.seat)).toEqual(["left", "top", "right", "bottom"]);
        expect(cross.flush).toBe(true);
    });

    it("collides the middle pair sideways and lays the others on the edges", () => {
        const [first, second, third, fourth] = seatingFor(4, "cross").seats;

        expect(first.area).toBe("col-start-1 row-start-2");
        expect(third.area).toBe("col-start-2 row-start-2");
        expect(second.area).toBe("col-span-2 row-start-1");
        expect(fourth.area).toBe("col-span-2 row-start-3");
    });

    it("falls back to the sides for pods the cross was not built for", () => {
        expect(seatingFor(3, "cross")).toEqual(seatingFor(3, "sides"));
        expect(seatingFor(6, "cross")).toEqual(seatingFor(6, "sides"));
    });

    it("turns the side seats and keeps them apart", () => {
        const sides = seatingFor(4, "sides");

        expect(sides.seats.map((placement) => placement.seat)).toEqual(["left", "right", "right", "left"]);
        expect(sides.flush).toBe(false);
    });

    it("counts the side seats clockwise from the top left", () => {
        expect(seatingFor(4, "sides").seats.map((placement) => placement.area)).toEqual([
            "col-start-1 row-start-1",
            "col-start-2 row-start-1",
            "col-start-2 row-start-2",
            "col-start-1 row-start-2",
        ]);
        expect(seatingFor(6, "sides").seats.map((placement) => placement.area)).toEqual([
            "col-start-1 row-start-1",
            "col-start-2 row-start-1",
            "col-start-2 row-start-2",
            "col-start-2 row-start-3",
            "col-start-1 row-start-3",
            "col-start-1 row-start-2",
        ]);
    });

    it("places one tile per player", () => {
        for (const count of [2, 3, 4, 5, 6]) {
            expect(seatingFor(count, "sides").seats).toHaveLength(count);
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
            keepAwake: false,
            lockOrientation: false,
        });

        expect(loadLifeTrackerSettings()).toEqual({
            startingLife: 20,
            playerCount: 2,
            arrangement: "cross",
            keepAwake: false,
            lockOrientation: false,
        });
    });

    it("keeps a typed starting total", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", storage(values));

        saveLifeTrackerSettings({
            startingLife: 13,
            playerCount: 4,
            arrangement: "sides",
            keepAwake: true,
            lockOrientation: true,
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
