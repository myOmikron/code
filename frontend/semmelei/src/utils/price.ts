const FORMAT = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/**
 * Format a price in euro cents as a localized currency string
 *
 * @param cents price in euro cents
 *
 * @returns formatted price, e.g. "1,20 €"
 */
export function formatPrice(cents: number): string {
    return FORMAT.format(cents / 100);
}
