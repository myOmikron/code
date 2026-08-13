/**
 * Format an ISO date (`YYYY-MM-DD`) or timestamp for display.
 *
 * Always German format (e.g. "10. Juli 2026") — the shop is German-first,
 * and dates should not follow the browser locale (which would render e.g.
 * "Jul 10, 2026" for an English browser).
 *
 * @param iso the ISO date or datetime string
 *
 * @returns the German-formatted date
 */
export function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(iso));
}

/**
 * Format a timestamp as date + time of day.
 *
 * German format like {@link formatDate} — used for the order deadline, which
 * the shop states to the minute.
 *
 * @param iso the ISO datetime string
 *
 * @returns the German-formatted date and time
 */
export function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * Whether a deadline has passed.
 *
 * Only ever a hint for the UI: the server decides, and rejects a late order
 * no matter what the browser's clock says.
 *
 * @param iso the ISO datetime string
 *
 * @returns whether the deadline is in the past
 */
export function isPast(iso: string): boolean {
    return new Date(iso).getTime() <= Date.now();
}
