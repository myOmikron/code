/**
 * The round clock as a pure reading of its deadline, the device's time and the skew to the server.
 */

import type { RoundResponse } from "src/api/generated";

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
 * A round's clock, or `null` once the round is closed
 *
 * A closed round's timer still holds a deadline, which would otherwise read as a clock running
 * into overtime.
 *
 * @param round the round
 *
 * @returns the clock fields
 */
export function roundClockOf(round: Pick<RoundResponse, "status" | "timer">): RoundClock | null {
    if (round.status === "Complete") return null;
    return {
        endsAt: round.timer.ends_at ?? null,
        pausedAt: round.timer.paused_at ?? null,
        lengthSeconds: round.timer.length_seconds,
    };
}

/**
 * Reads a clock; overtime goes negative rather than clamping at zero
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
 * The whole round trip is charged to skew; the error is at most half the latency.
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
 * Folds a fresh skew sample into the running estimate, damping jitter so the face does not skip
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
