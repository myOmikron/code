import { describe, expect, it } from "vitest";
import { defaultFinish, defaultFoil } from "src/utils/default-finish";

describe("defaultFinish", () => {
    it("files a printing made without foil as non-foil", () => {
        expect(defaultFinish(["nonfoil", "foil"])).toBe("Nonfoil");
    });

    it("files a foil-only printing as foil", () => {
        expect(defaultFinish(["foil"])).toBe("Foil");
        expect(defaultFinish(["foil", "etched"])).toBe("Foil");
    });

    it("files an etched-only printing as etched", () => {
        expect(defaultFinish(["etched"])).toBe("Etched");
    });

    it("files a printing whose finishes are unknown as non-foil", () => {
        expect(defaultFinish([])).toBe("Nonfoil");
    });
});

describe("defaultFoil", () => {
    it("puts a printing with a plain finish into a deck as non-foil", () => {
        expect(defaultFoil(["nonfoil", "etched"])).toBe(false);
    });

    it("puts a foil-only or etched-only printing into a deck as foil", () => {
        expect(defaultFoil(["foil"])).toBe(true);
        expect(defaultFoil(["etched"])).toBe(true);
    });
});
