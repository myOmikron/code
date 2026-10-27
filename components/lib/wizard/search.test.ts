import { describe, expect, it } from "vitest";
import { wizardSearchSchema } from "./search";

describe("wizardSearchSchema", () => {
    it("keeps a step ID", () => {
        expect(wizardSearchSchema({ step: "address" })).toEqual({ step: "address" });
    });

    it("drops a missing or malformed step", () => {
        expect(wizardSearchSchema({})).toEqual({});
        expect(wizardSearchSchema({ step: 3 })).toEqual({});
        expect(wizardSearchSchema({ step: "" })).toEqual({});
    });
});
