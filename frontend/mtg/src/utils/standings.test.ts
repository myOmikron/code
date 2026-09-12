import { describe, expect, it } from "vitest";
import { formatAveragePoints, formatPercent, formatRecord } from "src/utils/standings";

describe("formatPercent", () => {
    it("renders a whole percentage without inventing precision", () => {
        expect(formatPercent(10_000)).toBe("100.00 %");
        expect(formatPercent(5_000)).toBe("50.00 %");
        expect(formatPercent(0)).toBe("0.00 %");
    });

    it("keeps the two decimals a basis point actually carries", () => {
        expect(formatPercent(6_650)).toBe("66.50 %");
        expect(formatPercent(3_300)).toBe("33.00 %");
        expect(formatPercent(4_285)).toBe("42.85 %");
        expect(formatPercent(1_428)).toBe("14.28 %");
    });

    it("pads a single trailing digit rather than dropping it", () => {
        expect(formatPercent(4_205)).toBe("42.05 %");
    });
});

describe("formatAveragePoints", () => {
    it("reads the same fixed point as points rather than a percentage", () => {
        expect(formatAveragePoints(23_333)).toBe("2.33");
        expect(formatAveragePoints(35_000)).toBe("3.50");
        expect(formatAveragePoints(0)).toBe("0.00");
    });
});

describe("formatRecord", () => {
    it("writes wins, losses and draws the way a pairings sheet does", () => {
        expect(formatRecord(3, 1, 0)).toBe("3–1–0");
    });
});
