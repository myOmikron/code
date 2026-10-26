/**
 * The round timer as a pure reading of its end, this device's clock and its skew to the server.
 */

/** What a round timer reads right now */
export type ClockReading = {
    /** Seconds left, a started second counting as a whole one; 0 once time is up */
    seconds: number;
    /** Whether time is up */
    timeUp: boolean;
};

/**
 * Reads a round timer
 *
 * @param endsAt when time is up, as the API sends it
 * @param nowMs this device's clock, in milliseconds
 * @param skewMs how far this device's clock is ahead of the server's, in milliseconds
 *
 * @returns what the timer reads
 */
export function readClock(endsAt: string, nowMs: number, skewMs: number): ClockReading {
    const leftMs = Date.parse(endsAt) - (nowMs - skewMs);
    if (leftMs <= 0) return { seconds: 0, timeUp: true };
    return { seconds: Math.ceil(leftMs / 1000), timeUp: false };
}

/**
 * Seconds as a clock face
 *
 * @param seconds how many seconds, not negative
 *
 * @returns `12:04` or `1:02:30`
 */
export function formatClock(seconds: number): string {
    const total = Math.max(0, Math.trunc(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const pad = (value: number) => value.toString().padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/**
 * How far this device's clock is ahead of the server's
 *
 * The whole round trip is charged to the skew, so it is off by at most the latency.
 *
 * @param serverTime the server's clock when it answered, as the API sends it
 * @param receivedAtMs this device's clock when the answer arrived
 *
 * @returns milliseconds this device is ahead
 */
export function clockSkew(serverTime: string, receivedAtMs: number): number {
    return receivedAtMs - Date.parse(serverTime);
}
