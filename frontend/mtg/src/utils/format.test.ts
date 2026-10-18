import { describe, expect, it } from "vitest";
import { formatDuration } from "src/utils/format";

describe("formatDuration", () => {
    it("shows short runs in milliseconds", () => {
        expect(formatDuration(0)).toBe("0 ms");
        expect(formatDuration(850)).toBe("850 ms");
    });

    it("shows runs under a minute in seconds with one decimal", () => {
        expect(formatDuration(1_000)).toBe("1,0 s");
        expect(formatDuration(42_340)).toBe("42,3 s");
    });

    it("shows longer runs in minutes and seconds", () => {
        expect(formatDuration(60_000)).toBe("1 min 0 s");
        expect(formatDuration(754_900)).toBe("12 min 34 s");
    });

    it("shows runs of an hour or more in hours and minutes", () => {
        expect(formatDuration(3_600_000)).toBe("1 h 0 min");
        expect(formatDuration(5_520_000)).toBe("1 h 32 min");
    });
});
