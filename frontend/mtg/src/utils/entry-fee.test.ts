import { describe, expect, it } from "vitest";
import { formatEntryFee, fromMinorUnits, toMinorUnits } from "src/utils/entry-fee";

describe("toMinorUnits", () => {
    it("reads euros with a comma or a point as cents", () => {
        expect(toMinorUnits("5", "EUR")).toBe(500);
        expect(toMinorUnits("5,50", "EUR")).toBe(550);
        expect(toMinorUnits("12.5", "EUR")).toBe(1250);
        expect(toMinorUnits(" 0,99 ", "EUR")).toBe(99);
    });

    it("reads a currency without fractions as whole units", () => {
        expect(toMinorUnits("1000", "JPY")).toBe(1000);
        expect(toMinorUnits("1000,5", "JPY")).toBeNull();
    });

    it("refuses what is no amount", () => {
        expect(toMinorUnits("", "EUR")).toBeNull();
        expect(toMinorUnits("fünf", "EUR")).toBeNull();
        expect(toMinorUnits("5,555", "EUR")).toBeNull();
        expect(toMinorUnits("-5", "EUR")).toBeNull();
    });
});

describe("fromMinorUnits", () => {
    it("writes cents as euros for the form", () => {
        expect(fromMinorUnits(550, "EUR")).toBe("5.50");
        expect(fromMinorUnits(500, "EUR")).toBe("5.00");
        expect(fromMinorUnits(1000, "JPY")).toBe("1000");
    });
});

describe("formatEntryFee", () => {
    it("formats the amount in its currency", () => {
        expect(formatEntryFee({ amount: 550, currency: "EUR" }, "de-DE")).toBe("5,50 €");
        expect(formatEntryFee({ amount: 1250, currency: "USD" }, "en-US")).toBe("$12.50");
    });
});
