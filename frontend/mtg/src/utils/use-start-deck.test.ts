import { describe, expect, it, vi } from "vitest";

vi.mock("src/api/api", () => ({ Api: {} }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));

const { pairName } = await import("src/utils/use-start-deck");

describe("pairName", () => {
    it("names a pair after both Commanders", () => {
        expect(pairName("Baeloth Barrityl, Entertainer", { name: "Raised by Giants" })).toBe(
            "Baeloth Barrityl, Entertainer & Raised by Giants",
        );
        expect(pairName("Krenko, Mob Boss", null)).toBe("Krenko, Mob Boss");
    });
});
