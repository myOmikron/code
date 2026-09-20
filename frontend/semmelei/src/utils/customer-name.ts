/** The name fields an order carries */
export type CustomerName = {
    /** The customer's first name, if given */
    first_name?: string | null;
    /** The customer's last name */
    last_name: string;
};

/**
 * The name as the counter reads it: last name first, so a list sorted by it
 * reads naturally
 *
 * @param name the order's name fields
 *
 * @returns "Last, First" or just the last name
 */
export function formatCounterName(name: CustomerName): string {
    return name.first_name ? `${name.last_name}, ${name.first_name}` : name.last_name;
}

/**
 * The name as the customer reads it themselves
 *
 * @param name the order's name fields
 *
 * @returns "First Last" or just the last name
 */
export function formatCustomerName(name: CustomerName): string {
    return name.first_name ? `${name.first_name} ${name.last_name}` : name.last_name;
}

/**
 * Order two names by last name, then first name, with German collation
 *
 * @param a the first name
 * @param b the second name
 *
 * @returns the comparison result for `Array.prototype.sort`
 */
export function compareCustomerNames(a: CustomerName, b: CustomerName): number {
    return a.last_name.localeCompare(b.last_name, "de") || (a.first_name ?? "").localeCompare(b.first_name ?? "", "de");
}
