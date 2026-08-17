/**
 * Drawing without replacement, which is what a deck of cards is.
 *
 * Every "how likely is my opening hand to …" question in Magic is the same
 * distribution: a deck holds some number of the thing you want, you see a
 * number of cards, how often do enough of them show up. No simulation is
 * needed, the answer is exact, and it costs a few sums.
 *
 * The maths runs on log factorials rather than factorials: a hundred card deck
 * would otherwise overflow a double long before the division cancels it out.
 */

/** Log factorials, grown on demand and kept between calls */
const LOG_FACTORIALS: Array<number> = [0];

/**
 * The natural log of `value!`
 *
 * @param value the number to take the factorial of
 *
 * @returns its log factorial
 */
function logFactorial(value: number): number {
    for (let index = LOG_FACTORIALS.length; index <= value; index += 1) {
        LOG_FACTORIALS[index] = (LOG_FACTORIALS[index - 1] ?? 0) + Math.log(index);
    }
    return LOG_FACTORIALS[value] ?? 0;
}

/**
 * The natural log of `n choose k`
 *
 * @param n how many there are
 * @param k how many are taken
 *
 * @returns the log of the binomial coefficient, `-Infinity` when there are none
 */
function logChoose(n: number, k: number): number {
    if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
    return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/**
 * How likely exactly `hits` of the wanted cards are among the drawn ones
 *
 * @param population how many cards there are in total
 * @param successes how many of them are the wanted card
 * @param draws how many cards are seen
 * @param hits how many of the wanted ones show up
 *
 * @returns the probability, between zero and one
 */
export function exactly(population: number, successes: number, draws: number, hits: number): number {
    if (hits > successes || hits > draws) return 0;
    if (draws - hits > population - successes) return 0;

    const log =
        logChoose(successes, hits) + logChoose(population - successes, draws - hits) - logChoose(population, draws);
    return Math.exp(log);
}

/**
 * How likely at least `wanted` of the wanted cards are among the drawn ones
 *
 * The everyday question: "how often do I keep a hand with two lands in it" is
 * `atLeast(99, 36, 7, 2)`.
 *
 * @param population how many cards there are in total
 * @param successes how many of them are the wanted card
 * @param draws how many cards are seen
 * @param wanted how many are needed
 *
 * @returns the probability, between zero and one
 */
export function atLeast(population: number, successes: number, draws: number, wanted: number): number {
    if (wanted <= 0) return 1;
    if (population <= 0 || draws <= 0 || successes < wanted) return 0;

    // Summed from the other end when that is the shorter sum, which it usually
    // is: "at least two lands" over a hand of seven is five terms the other way
    // and two this way.
    let below = 0;
    for (let hits = 0; hits < wanted; hits += 1) {
        below += exactly(population, successes, draws, hits);
    }
    return Math.min(1, Math.max(0, 1 - below));
}

/**
 * How likely a hand holds between `low` and `high` of the wanted cards
 *
 * @param population how many cards there are in total
 * @param successes how many of them are the wanted card
 * @param draws how many cards are seen
 * @param low the fewest that still counts
 * @param high the most that still counts
 *
 * @returns the probability, between zero and one
 */
export function between(population: number, successes: number, draws: number, low: number, high: number): number {
    let total = 0;
    for (let hits = low; hits <= high; hits += 1) {
        total += exactly(population, successes, draws, hits);
    }
    return Math.min(1, Math.max(0, total));
}
