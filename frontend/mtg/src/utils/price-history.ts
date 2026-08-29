/**
 * Reading a card's price history: what to plot, and what to say about it.
 *
 * The server hands over one row per day, thinned to one a week past a quarter,
 * with four euro-cent figures on each. Everything here turns that into the two
 * series a chart draws and the handful of numbers printed beside it.
 *
 * Pure on purpose: the arithmetic is what a reader will argue with, and it is
 * easier to argue with a test than with a chart.
 */

import type { CardFinish, PriceDayResponse } from "src/api/generated";

/** One day, as the chart plots it */
export type PricePoint = {
    /** The day as `YYYY-MM-DD` */
    day: string;
    /** The cheapest offer in euro, `null` when nobody offered the card */
    low: number | null;
    /** Cardmarket's trend price in euro */
    trend: number | null;
};

/** Which of the two series the history was read for */
export type PriceSeries = {
    /** The days, oldest first */
    points: Array<PricePoint>;
    /** The finish the numbers belong to */
    finish: CardFinish;
    /** Whether that is the finish that was asked for */
    substituted: boolean;
};

/** What one span of time did to the price */
export type PriceChange = {
    /** How far back the comparison reaches, in days */
    days: number;
    /** What the price did over it, as a fraction — `0.1` is ten percent up */
    fraction: number | null;
    /** What it stood at back then, in euro */
    from: number | null;
};

/** The numbers printed beside the chart */
export type PriceStats = {
    /** The most recent price, in euro */
    current: number | null;
    /** The day that price is from */
    currentDay: string | null;
    /** The cheapest the card has been in the window */
    low: { value: number; day: string } | null;
    /** The dearest it has been */
    high: { value: number; day: string } | null;
    /** Where the current price sits between the two, `0` at the low, `1` at the high */
    position: number | null;
    /** What the price did over the usual spans */
    changes: Array<PriceChange>;
};

/** The spans the summary reports on */
export const CHANGE_SPANS = [7, 30, 90] as const;

/**
 * Turns euro cents into euro, keeping `null` as `null`
 *
 * @param cents the amount in cents
 *
 * @returns the amount in euro
 */
function euro(cents: number | null | undefined): number | null {
    return cents == null ? null : cents / 100;
}

/**
 * Whether a series carries any number at all
 *
 * @param points the days
 *
 * @returns whether anything can be drawn
 */
function priced(points: Array<PricePoint>): boolean {
    return points.some((point) => point.low !== null || point.trend !== null);
}

/**
 * Reads the history as one finish's two series.
 *
 * A foil is read off the foil columns, and anything that is not plain cardboard
 * counts as foil — Cardmarket grades an etched card on the foil side of its one
 * flag, the same rule `unitPriceCents` follows.
 *
 * Falls back to the plain series when the asked-for one holds no number at all,
 * and says so. A card that was never printed in foil has an empty foil history
 * for good, and an empty chart says less than the plain one plus a note.
 *
 * @param days the history as the server sent it, oldest first
 * @param finish the finish the reader is holding
 *
 * @returns the series to draw
 */
export function seriesFor(days: Array<PriceDayResponse>, finish: CardFinish): PriceSeries {
    const foil = finish !== "Nonfoil";

    const points = days.map((day) => ({
        day: day.day,
        low: euro(foil ? day.low_foil_cents : day.low_cents),
        trend: euro(foil ? day.trend_foil_cents : day.trend_cents),
    }));

    if (!foil || priced(points)) return { points, finish, substituted: false };

    const plain = days.map((day) => ({
        day: day.day,
        low: euro(day.low_cents),
        trend: euro(day.trend_cents),
    }));
    return { points: plain, finish: "Nonfoil", substituted: priced(plain) };
}

/**
 * The price a day stands for
 *
 * The cheapest offer where there is one, the trend price otherwise. The two
 * answer different questions — "what would this cost me today" against "what is
 * it worth" — and the first is the one somebody watching a card is asking, so
 * the summary follows it and falls back rather than reporting nothing.
 *
 * @param point the day
 *
 * @returns the price in euro, or `null` for a day with neither
 */
function priceOf(point: PricePoint): number | null {
    return point.low ?? point.trend;
}

/**
 * The day `days` before the given one, as `YYYY-MM-DD`
 *
 * @param day the day to count back from
 * @param days how far back
 *
 * @returns the earlier day
 */
function daysBefore(day: string, days: number): string {
    const stamp = Date.parse(`${day}T00:00:00Z`);
    return new Date(stamp - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * What the history says about a card.
 *
 * The comparisons reach for the newest day that is not after the one they are
 * aiming at, rather than for a day exactly that far back: past the daily window
 * the history holds one day a week, so "ninety days ago" is usually a day that
 * was never stored. Reaching backwards keeps the span honest — it can only ever
 * be reported as longer than it was, never shorter.
 *
 * A span that reaches past the oldest day held reports nothing rather than
 * comparing against the beginning of the history, which would quietly turn "90
 * days" into "since we started watching".
 *
 * @param points the series, oldest first
 *
 * @returns the summary
 */
export function statsFor(points: Array<PricePoint>): PriceStats {
    const dated = points.filter((point) => priceOf(point) !== null);

    const empty: PriceStats = {
        current: null,
        currentDay: null,
        low: null,
        high: null,
        position: null,
        changes: CHANGE_SPANS.map((days) => ({ days, fraction: null, from: null })),
    };
    if (dated.length === 0) return empty;

    const latest = dated[dated.length - 1];
    const current = priceOf(latest) as number;

    let low = { value: current, day: latest.day };
    let high = { value: current, day: latest.day };
    for (const point of dated) {
        const value = priceOf(point) as number;
        if (value < low.value) low = { value, day: point.day };
        if (value > high.value) high = { value, day: point.day };
    }

    const oldest = dated[0];
    const changes = CHANGE_SPANS.map((days): PriceChange => {
        const target = daysBefore(latest.day, days);
        if (target < oldest.day) return { days, fraction: null, from: null };

        let before: PricePoint | null = null;
        for (const point of dated) {
            if (point.day > target) break;
            before = point;
        }
        if (before === null) return { days, fraction: null, from: null };

        const from = priceOf(before) as number;
        // A card that was free is not a card that rose infinitely; there is
        // simply nothing to divide by.
        if (from === 0) return { days, fraction: null, from };
        return { days, fraction: (current - from) / from, from };
    });

    const span = high.value - low.value;

    return {
        current,
        currentDay: latest.day,
        low,
        high,
        // A flat history has no position between its two ends. Reporting the
        // middle would draw a marker that means nothing.
        position: span === 0 ? null : (current - low.value) / span,
        changes,
    };
}
