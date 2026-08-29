import { describe, expect, it } from "vitest";
import type { PriceDayResponse } from "src/api/generated";
import { seriesFor, statsFor } from "src/utils/price-history";

/**
 * Builds a day of the history the way the server sends one
 *
 * @param date the day, as `YYYY-MM-DD`
 * @param cents the prices it carries, absent ones left `null`
 *
 * @returns the day
 */
function day(date: string, cents: Partial<Omit<PriceDayResponse, "day">> = {}): PriceDayResponse {
    return {
        day: date,
        low_cents: null,
        trend_cents: null,
        low_foil_cents: null,
        trend_foil_cents: null,
        ...cents,
    };
}

describe("seriesFor", () => {
    it("reads a foil stack off the foil columns", () => {
        const series = seriesFor([day("2026-08-01", { low_cents: 100, low_foil_cents: 900 })], "Foil");
        expect(series.finish).toBe("Foil");
        expect(series.substituted).toBe(false);
        expect(series.points[0].low).toBe(9);
    });

    it("counts etched as foil, the way a stack is priced", () => {
        const series = seriesFor([day("2026-08-01", { low_cents: 100, low_foil_cents: 900 })], "Etched");
        expect(series.points[0].low).toBe(9);
    });

    it("falls back to the plain series for a card that was never foiled", () => {
        const series = seriesFor([day("2026-08-01", { low_cents: 100 })], "Foil");
        expect(series.finish).toBe("Nonfoil");
        expect(series.substituted).toBe(true);
        expect(series.points[0].low).toBe(1);
    });

    it("does not claim a substitution when there is nothing to fall back to", () => {
        const series = seriesFor([day("2026-08-01")], "Foil");
        expect(series.substituted).toBe(false);
    });
});

describe("statsFor", () => {
    const week = [
        { day: "2026-08-01", low: 1, trend: 1.2 },
        { day: "2026-08-04", low: 2, trend: 2.2 },
        { day: "2026-08-08", low: 1.5, trend: 1.6 },
    ];

    it("reports the newest day as the current price", () => {
        const stats = statsFor(week);
        expect(stats.current).toBe(1.5);
        expect(stats.currentDay).toBe("2026-08-08");
    });

    it("finds the cheapest and the dearest day", () => {
        const stats = statsFor(week);
        expect(stats.low).toEqual({ value: 1, day: "2026-08-01" });
        expect(stats.high).toEqual({ value: 2, day: "2026-08-04" });
        expect(stats.position).toBe(0.5);
    });

    it("falls back to the trend price on a day nobody offered the card", () => {
        const stats = statsFor([{ day: "2026-08-08", low: null, trend: 3 }]);
        expect(stats.current).toBe(3);
    });

    it("compares against the newest day at or before the span, not an exact one", () => {
        // Seven days before the 8th is the 1st, which is held. Thirty days
        // before it is not, and neither is anything older.
        const seven = statsFor(week).changes.find((change) => change.days === 7);
        expect(seven?.from).toBe(1);
        expect(seven?.fraction).toBeCloseTo(0.5);
    });

    it("reaches backwards when the exact day was thinned away", () => {
        const thinned = [
            { day: "2026-05-04", low: 10, trend: 10 },
            { day: "2026-05-11", low: 12, trend: 12 },
            { day: "2026-08-08", low: 15, trend: 15 },
        ];
        const ninety = statsFor(thinned).changes.find((change) => change.days === 90);
        // 90 days before the 8th is 2026-05-10, which is not held; the 4th is.
        expect(ninety?.from).toBe(10);
        expect(ninety?.fraction).toBeCloseTo(0.5);
    });

    it("reports nothing for a span reaching past the oldest day held", () => {
        const thirty = statsFor(week).changes.find((change) => change.days === 30);
        expect(thirty?.fraction).toBeNull();
        expect(thirty?.from).toBeNull();
    });

    it("does not divide by a price of zero", () => {
        const free = [
            { day: "2026-08-01", low: 0, trend: 0 },
            { day: "2026-08-08", low: 1, trend: 1 },
        ];
        const seven = statsFor(free).changes.find((change) => change.days === 7);
        expect(seven?.from).toBe(0);
        expect(seven?.fraction).toBeNull();
    });

    it("leaves a flat history without a position between its ends", () => {
        const flat = statsFor([{ day: "2026-08-08", low: 2, trend: 2 }]);
        expect(flat.position).toBeNull();
    });

    it("answers an empty history without inventing anything", () => {
        const stats = statsFor([]);
        expect(stats.current).toBeNull();
        expect(stats.low).toBeNull();
        expect(stats.changes.every((change) => change.fraction === null)).toBe(true);
    });
});
