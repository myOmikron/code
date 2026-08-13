import { Err, Ok, Result } from "./result";

const re = new RegExp(`^(?=.{1,253}\\.?$)(?:(?!-|[^.]+_)[A-Za-z0-9-_]{1,63}(?<!-)(?:\\.|$)){2,}$`);

/**
 * Tests whether an input string seems to be a valid domain
 *
 * @param domain The string to test
 *
 * @returns boolean whether the test passed
 */
export function validateDomain(domain: string) {
    return re.test(domain);
}

/**
 * Validate a date string
 *
 * @param date The date to check
 *
 * @returns The result with the valid date as okay and an "invalid date" as error
 */
export function validateDate(date: string): Result<Date, "invalid date"> {
    const d = new Date(date);
    if (Number.isNaN(d.valueOf())) {
        return new Err("invalid date");
    }
    return new Ok(d);
}
