/**
 * The round clock, as a pure reading rather than a ticking number
 *
 * Nothing here counts down. A clock is a function of when it ends, what the time is now and how
 * wrong this device's own clock is — which is what makes backgrounding, a sleeping phone, a
 * restored tab and a mid-round reload all correct without a line of code for any of them. The
 * only moving part is the component that asks again once a second.
 */

/** The three fields a round carries for its clock, as the API sends them */
export type RoundClock = {
    /** When the clock runs out, `null` while it has never been started */
    endsAt: string | null;
    /** When it was paused, `null` while running or idle */
    pausedAt: string | null;
    /** How long the round runs for, in seconds */
    lengthSeconds: number;
};

/** What a clock reads right now */
export type ClockReading = {
    /** Seconds left; negative once the round has run over */
    seconds: number;
    /** Whether the clock has ever been started */
    started: boolean;
    /** Whether it is stopped with time left on it */
    paused: boolean;
    /** Whether it has run out */
    over: boolean;
};

/**
 * Read a clock
 *
 * Overtime is deliberately allowed to go negative rather than clamping at zero: a judge needs to
 * know the round is four minutes over, not merely that it is finished.
 *
 * @param clock the round's three fields
 * @param nowMs this device's own clock, in milliseconds
 * @param skewMs how far this device is ahead of the server, in milliseconds
 *
 * @returns what the clock reads
 */
export function readClock(clock: RoundClock, nowMs: number, skewMs: number): ClockReading {
    if (clock.endsAt === null) {
        return { seconds: clock.lengthSeconds, started: false, paused: false, over: false };
    }

    const endsAt = Date.parse(clock.endsAt);
    // A paused clock is measured against the moment it stopped, so it holds still however long
    // the desk leaves it.
    const reference = clock.pausedAt === null ? nowMs - skewMs : Date.parse(clock.pausedAt);
    const seconds = Math.round((endsAt - reference) / 1000);

    return {
        seconds,
        started: true,
        paused: clock.pausedAt !== null,
        over: seconds <= 0,
    };
}

/**
 * A count of seconds as a clock face
 *
 * Not in `format.ts`, which is `Intl` work: `mm:ss` is a clock face rather than a locale format,
 * and it belongs beside the thing that produces the seconds.
 *
 * @param seconds how many seconds, possibly negative
 *
 * @returns `12:04`, `1:02:30` or `-3:41`
 */
export function formatDuration(seconds: number): string {
    const sign = seconds < 0 ? "-" : "";
    const total = Math.abs(Math.trunc(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;

    const pad = (value: number) => value.toString().padStart(2, "0");
    return hours > 0 ? `${sign}${hours}:${pad(minutes)}:${pad(rest)}` : `${sign}${minutes}:${pad(rest)}`;
}

/**
 * How far this device's clock is ahead of the server's
 *
 * The whole round trip is charged to skew, which biases the estimate by at most half the latency —
 * under a fifth of a second in a shop, and invisible on a face that only shows seconds. Building
 * anything cleverer here would be solving a problem nobody has.
 *
 * @param serverTime what the server said the time was
 * @param receivedAtMs this device's clock when the answer arrived
 *
 * @returns milliseconds this device is ahead
 */
export function clockSkew(serverTime: string, receivedAtMs: number): number {
    return receivedAtMs - Date.parse(serverTime);
}

/**
 * Fold a fresh skew sample into the running estimate
 *
 * Raw samples jitter by a few hundred milliseconds, which is enough to make the displayed second
 * skip or repeat. Weighting the history heavily keeps the face steady while still following a
 * device whose clock is actually drifting.
 *
 * @param previous the estimate so far, `null` for the first sample
 * @param sample the fresh sample
 *
 * @returns the new estimate
 */
export function smoothSkew(previous: number | null, sample: number): number {
    if (previous === null) return sample;
    return Math.round(previous * 0.7 + sample * 0.3);
}
