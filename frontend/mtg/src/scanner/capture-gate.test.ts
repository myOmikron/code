import { describe, expect, it } from "vitest";
import { createCaptureGate } from "./capture-gate";

const card = { id: "a", name: "Card A" };
describe("capture gate", () => {
    it("does not double-book after a single missing outline", () => {
        const gate = createCaptureGate();
        expect(gate.accept(card)).toBe(true);
        gate.observe(false);
        gate.observe(true);
        expect(gate.accept(card)).toBe(false);
    });
    it("does not count fluctuating editions as more copies", () => {
        const gate = createCaptureGate();
        gate.accept(card);
        expect(gate.accept({ ...card, id: "another-edition" })).toBe(false);
        expect(gate.accept(card)).toBe(false);
    });
    it("allows another copy after two empty scans", () => {
        const gate = createCaptureGate();
        gate.accept(card);
        gate.observe(false);
        gate.observe(false);
        expect(gate.accept(card)).toBe(true);
    });
    it("requires consecutive absences and resets the count on recognition", () => {
        const gate = createCaptureGate();
        gate.accept(card);
        gate.observe(false);
        expect(gate.accept(card)).toBe(false);
        gate.observe(false);
        expect(gate.accept(card)).toBe(false);
    });
    it("allows another card and a fresh scanner session", () => {
        const gate = createCaptureGate();
        gate.accept(card);
        expect(gate.accept({ id: "b", name: "Card B" })).toBe(true);
        gate.reset();
        expect(gate.accept({ id: "b", name: "Card B" })).toBe(true);
    });
});
