import type { EntryFeeSchema } from "src/api/generated";

/** The currencies the settings form offers, the first one preselected */
export const CURRENCIES: Array<string> = ["EUR", "CHF", "GBP", "USD"];

/**
 * How many digits a currency writes after the decimal point: 2 for euros, 0 for yen
 *
 * @param currency the ISO 4217 code
 *
 * @returns the digits, as `Intl` knows them
 */
function fractionDigits(currency: string): number {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * An amount typed into the form, in the currency's smallest unit as the service stores it
 *
 * Takes a comma or a point before the fraction.
 *
 * @param typed the amount as typed, e.g. `5,50`
 * @param currency the ISO 4217 code
 *
 * @returns the amount in cents (or whatever the smallest unit is), `null` if it is none
 */
export function toMinorUnits(typed: string, currency: string): number | null {
    const digits = fractionDigits(currency);
    const match = /^(\d+)(?:[.,](\d*))?$/.exec(typed.trim());
    if (match === null) return null;
    const fraction = match[2] ?? "";
    if (fraction.length > digits) return null;
    return Number(match[1]) * 10 ** digits + Number(fraction.padEnd(digits, "0") || "0");
}

/**
 * A stored amount as the form shows it for editing
 *
 * @param amount the amount in the currency's smallest unit
 * @param currency the ISO 4217 code
 *
 * @returns the amount with a point before the fraction, e.g. `5.50`
 */
export function fromMinorUnits(amount: number, currency: string): string {
    const digits = fractionDigits(currency);
    return (amount / 10 ** digits).toFixed(digits);
}

/**
 * An entry fee as players read it
 *
 * @param fee the fee
 * @param locale the locale to write it in, the browser's by default
 *
 * @returns the amount with its currency, e.g. `5,50 €`
 */
export function formatEntryFee(fee: EntryFeeSchema, locale?: string): string {
    const digits = fractionDigits(fee.currency);
    return new Intl.NumberFormat(locale, { style: "currency", currency: fee.currency }).format(
        fee.amount / 10 ** digits,
    );
}
