import type { CardQuad } from "./scan-client";

/**
 * Format a EUR amount in German locale.
 *
 * @param value
 * @returns the formatted amount
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

/**
 * Format a EUR amount for a chart axis, where the full form is too wide.
 *
 * @param value
 * @returns the shortened amount, e.g. `1,2 Tsd. €`
 */
export function formatCurrencyCompact(value: number): string {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

/**
 * Format a `YYYY-MM` month for display.
 *
 * @param month the month, as the collection statistics key it
 * @returns the month and year, e.g. `Mär 2024`
 */
export function formatMonth(month: string): string {
    const [year, index] = month.split("-");
    if (year === undefined || index === undefined) return month;
    return new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric" }).format(
        new Date(Number(year), Number(index) - 1, 1),
    );
}

/**
 * Format a `YYYY-MM-DD` day for display.
 *
 * The year is left off: everything this renders sits on an axis or in a line of
 * its own where the year is already implied by its neighbours, and repeating it
 * on every tick is what makes an axis unreadable.
 *
 * @param day the day, as the price history keys it
 *
 * @returns the day and month, e.g. `27. Aug`
 */
export function formatDay(day: string): string {
    const parsed = Date.parse(`${day}T00:00:00Z`);
    if (Number.isNaN(parsed)) return day;
    return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}

/**
 * Format a `YYYY-MM-DD` day in full, for a line that stands on its own.
 *
 * @param day the day, as the price history keys it
 *
 * @returns the full date, e.g. `27. Aug. 2026`
 */
export function formatFullDay(day: string): string {
    const parsed = Date.parse(`${day}T00:00:00Z`);
    if (Number.isNaN(parsed)) return day;
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

/**
 * Format a fraction as a signed percentage.
 *
 * Signed on purpose: this only ever renders a change, and a change without its
 * direction is worse than no number.
 *
 * @param fraction the change, where `0.1` is ten percent up
 *
 * @returns the percentage, e.g. `+10,0 %`
 */
export function formatChange(fraction: number): string {
    return new Intl.NumberFormat("de-DE", {
        style: "percent",
        signDisplay: "exceptZero",
        maximumFractionDigits: 1,
    }).format(fraction);
}

/**
 * SVG polygon `points` string for a quad, clockwise from the top-left.
 *
 * @param quad
 * @returns the `points` attribute value
 */
export function quadPoints(quad: CardQuad): string {
    return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * Format a timestamp as a plain date, in German regardless of the browser locale
 *
 * @param iso the ISO timestamp
 *
 * @returns the formatted date
 */
export function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(iso));
}

/**
 * Format a timestamp for display, in German regardless of the browser locale
 *
 * @param iso the ISO timestamp
 *
 * @returns the formatted date and time
 */
export function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
