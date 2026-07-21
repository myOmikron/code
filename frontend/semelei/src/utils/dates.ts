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
 * The next Saturday (strictly after today) as ISO date (`YYYY-MM-DD`) in local time
 *
 * All orders are picked up on the next Saturday; orders placed on a
 * Saturday go to the following week.
 *
 * @returns the next Saturday's date
 */
export function nextSaturdayIsoDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7));
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}
