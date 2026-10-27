import { describe, expect, it } from "vitest";
import { clockSkew, formatTimer, readRunningTimer, readTimer } from "src/utils/round-timer";

/** A fixed instant to measure everything against */
const NOW = Date.parse("2026-11-07T18:30:00.000Z");

/**
 * The end of a round timer `seconds` after {@link NOW}
 *
 * @param seconds how far out time is up
 *
 * @returns the end as the API sends it
 */
function endsIn(seconds: number): string {
    return new Date(NOW + seconds * 1000).toISOString();
}

describe("readRunningTimer", () => {
    it("counts down to the end", () => {
        expect(readRunningTimer(endsIn(600), NOW, 0)).toEqual({ seconds: 600, timeUp: false });
        expect(readRunningTimer(endsIn(600), NOW + 60_000, 0)).toEqual({ seconds: 540, timeUp: false });
    });

    it("counts a started second as a whole one until time is up", () => {
        expect(readRunningTimer(endsIn(1), NOW + 500, 0)).toEqual({ seconds: 1, timeUp: false });
    });

    it("stops at zero once time is up", () => {
        expect(readRunningTimer(endsIn(600), NOW + 600_000, 0)).toEqual({ seconds: 0, timeUp: true });
        expect(readRunningTimer(endsIn(600), NOW + 900_000, 0)).toEqual({ seconds: 0, timeUp: true });
    });

    it("corrects for a device whose own clock is wrong", () => {
        // This phone believes it is five minutes later than it is.
        expect(readRunningTimer(endsIn(600), NOW + 300_000, 300_000)).toEqual({ seconds: 600, timeUp: false });
    });
});

describe("readTimer", () => {
    it("counts a running timer down from its end", () => {
        const timer = { ends_at: endsIn(600), paused: false, remaining_seconds: 600, time_up: false };
        expect(readTimer(timer, NOW + 60_000, 0)).toEqual({ seconds: 540, timeUp: false });
    });

    it("holds a paused timer at what the server answered", () => {
        const timer = { ends_at: endsIn(600), paused: true, remaining_seconds: 420, time_up: false };
        expect(readTimer(timer, NOW, 0)).toEqual({ seconds: 420, timeUp: false });
        expect(readTimer(timer, NOW + 3_600_000, 0)).toEqual({ seconds: 420, timeUp: false });
    });

    it("keeps time up on a timer paused after it ran out", () => {
        const timer = { ends_at: endsIn(-60), paused: true, remaining_seconds: 0, time_up: true };
        expect(readTimer(timer, NOW, 0)).toEqual({ seconds: 0, timeUp: true });
    });
});

describe("formatTimer", () => {
    it("writes minutes and seconds", () => {
        expect(formatTimer(724)).toBe("12:04");
        expect(formatTimer(59)).toBe("0:59");
        expect(formatTimer(0)).toBe("0:00");
    });

    it("adds hours only once there is one", () => {
        expect(formatTimer(3599)).toBe("59:59");
        expect(formatTimer(3750)).toBe("1:02:30");
    });
});

describe("clockSkew", () => {
    it("is zero for a device that agrees with the server", () => {
        expect(clockSkew(new Date(NOW).toISOString(), NOW)).toBe(0);
    });

    it("is positive for a device running ahead", () => {
        expect(clockSkew(new Date(NOW).toISOString(), NOW + 4000)).toBe(4000);
    });
});
