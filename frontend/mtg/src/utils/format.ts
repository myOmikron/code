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
