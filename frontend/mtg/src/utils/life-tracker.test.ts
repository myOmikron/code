import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_LIFE_TRACKER_SETTINGS,
    loadLifeTrackerSettings,
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

        saveLifeTrackerSettings({ startingLife: 20, playerCount: 2, arrangement: "cross" });

        expect(loadLifeTrackerSettings()).toEqual({ startingLife: 20, playerCount: 2, arrangement: "cross" });
    });

    it("keeps a typed starting total", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", storage(values));

        saveLifeTrackerSettings({ startingLife: 13, playerCount: 4, arrangement: "sides" });

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
