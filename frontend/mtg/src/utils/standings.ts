/** The fixed point standings percentages are carried in (10 000 is 100 %), the precision shown */
export const PERCENT_ONE = 10_000;

/**
 * A standings percentage, at the precision it is stored in
 *
 * @param basisPoints the value, where 10 000 is 100 %
 *
 * @returns the percentage, to two decimals
 */
export function formatPercent(basisPoints: number): string {
    const whole = Math.trunc(basisPoints / 100);
    const rest = Math.abs(basisPoints % 100);
    return `${whole}.${rest.toString().padStart(2, "0")} %`;
}

/**
 * The opponents' average match points, a point count rather than a percentage
 *
 * @param basisPoints the value, in the same fixed point as everything else
 *
 * @returns the average, to two decimals
 */
export function formatAveragePoints(basisPoints: number): string {
    const whole = Math.trunc(basisPoints / PERCENT_ONE);
    const rest = Math.abs(Math.trunc((basisPoints % PERCENT_ONE) / 100));
    return `${whole}.${rest.toString().padStart(2, "0")}`;
}

/**
 * A win–loss–draw record
 *
 * @param wins matches won
 * @param losses matches lost
 * @param draws matches drawn
 *
 * @returns the record
 */
export function formatRecord(wins: number, losses: number, draws: number): string {
    return `${wins}–${losses}–${draws}`;
}
