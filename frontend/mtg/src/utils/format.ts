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
 * SVG polygon `points` string for a quad, clockwise from the top-left.
 *
 * @param quad
 * @returns the `points` attribute value
 */
export function quadPoints(quad: CardQuad): string {
    return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map((p) => `${p.x},${p.y}`).join(" ");
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

/**
 * A printing's coordinate line, e.g. `LTR · #123 · DE`.
 *
 * The language is only spelled out when it is not English: set and collector number are shared
 * across all languages of a printing, so the language is what tells two otherwise identical
 * scans apart — and omitting the overwhelmingly common default keeps the line short.
 *
 * @param card the printing to describe
 * @param card.setCode the set code
 * @param card.collectorNumber the collector number
 * @param card.lang the Scryfall language code, when known
 *
 * @returns the coordinate line
 */
export function printingCoordinate(card: { setCode: string; collectorNumber: string; lang?: string }): string {
    const language = card.lang && card.lang !== "en" ? ` · ${card.lang.toUpperCase()}` : "";
    return `${card.setCode} · #${card.collectorNumber}${language}`;
}
