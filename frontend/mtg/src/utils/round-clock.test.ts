import { describe, expect, it } from "vitest";
import type { RoundClock } from "src/utils/round-clock";
import { clockSkew, formatDuration, readClock, smoothSkew } from "src/utils/round-clock";

/** A fixed instant to measure everything against */
const NOW = Date.parse("2026-09-11T18:00:00.000Z");

/**
 * A clock that runs out `seconds` from {@link NOW}
 *
 * @param seconds how far out the deadline sits
 * @param pausedAt when it was paused, if it was
 *
 * @returns the clock
 */
function running(seconds: number, pausedAt: string | null = null): RoundClock {
    return {
        endsAt: new Date(NOW + seconds * 1000).toISOString(),
        pausedAt,
        lengthSeconds: 3000,
    };
}

describe("readClock", () => {
    it("reads a clock that was never started as its full length", () => {
        const reading = readClock({ endsAt: null, pausedAt: null, lengthSeconds: 3000 }, NOW, 0);
        expect(reading).toEqual({ seconds: 3000, started: false, paused: false, over: false });
    });

    it("counts down from the deadline", () => {
        expect(readClock(running(600), NOW, 0).seconds).toBe(600);
        expect(readClock(running(600), NOW + 60_000, 0).seconds).toBe(540);
    });

    it("holds a paused clock still however long it is left", () => {
        const clock = running(600, new Date(NOW + 100_000).toISOString());
        expect(readClock(clock, NOW + 100_000, 0).seconds).toBe(500);
        expect(readClock(clock, NOW + 900_000, 0).seconds).toBe(500);
        expect(readClock(clock, NOW + 900_000, 0).paused).toBe(true);
    });

    it("keeps counting into overtime rather than stopping at zero", () => {
        const reading = readClock(running(600), NOW + 840_000, 0);
        expect(reading.seconds).toBe(-240);
        expect(reading.over).toBe(true);
    });

    it("corrects for a device whose own clock is wrong", () => {
        // This phone believes it is five minutes later than it is.
        const ahead = readClock(running(600), NOW + 300_000, 300_000);
        expect(ahead.seconds).toBe(600);
    });
});

describe("formatDuration", () => {
    it("writes minutes and seconds", () => {
        expect(formatDuration(724)).toBe("12:04");
        expect(formatDuration(0)).toBe("0:00");
        expect(formatDuration(59)).toBe("0:59");
    });

    it("adds an hour only once there is one", () => {
        expect(formatDuration(3600)).toBe("1:00:00");
        expect(formatDuration(3750)).toBe("1:02:30");
        expect(formatDuration(3599)).toBe("59:59");
    });

    it("signs overtime rather than hiding it", () => {
        expect(formatDuration(-221)).toBe("-3:41");
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

describe("smoothSkew", () => {
    it("takes the first sample as it stands", () => {
        expect(smoothSkew(null, 1200)).toBe(1200);
    });

    it("weights the history so a jittery sample barely moves the face", () => {
        expect(smoothSkew(1000, 1300)).toBe(1090);
    });

    it("still follows a device that is genuinely drifting", () => {
        let skew = smoothSkew(null, 0);
        for (let sample = 0; sample < 20; sample++) skew = smoothSkew(skew, 5000);
        expect(skew).toBeGreaterThan(4900);
    });
});
