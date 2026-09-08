import { describe, expect, it } from "vitest";
import { createAgreementTracker } from "./live-pipeline";

/**
 * Replays a run of frames and reports the frame that confirmed, counting from one.
 *
 * @param frames what each frame led with, `null` for a frame that found no card
 * @returns the confirming frame, or 0 when the run never confirmed
 */
function confirmsOn(frames: { id: string | null; score?: number; named?: boolean }[]): number {
    const tracker = createAgreementTracker();
    for (let frame = 0; frame < frames.length; frame += 1) {
        const seen = frames[frame];
        if (tracker.seen(seen.id, seen.score ?? 0.5, seen.named ?? false)) return frame + 1;
    }
    return 0;
}

describe("agreement tracker", () => {
    it("confirms a card that leads two frames running", () => {
        expect(confirmsOn([{ id: "a" }, { id: "a" }])).toBe(2);
    });

    it("does not confirm a single frame", () => {
        expect(confirmsOn([{ id: "a" }])).toBe(0);
    });

    // A hand-held card drops out of detection between frames, and those frames say nothing about
    // which card it is. While they took a place in the window, the two agreeing frames were pushed
    // apart before they could be counted together and the card had to be presented again.
    it("confirms across frames that found no card", () => {
        expect(confirmsOn([{ id: "a" }, { id: null }, { id: null }, { id: null }, { id: "a" }])).toBe(5);
    });

    // One stray reading between two agreeing ones used to veto outright, and the card then had to
    // be presented again from scratch.
    it("confirms despite a single better-scoring reading in between", () => {
        expect(
            confirmsOn([
                { id: "a", score: 0.5 },
                { id: "b", score: 0.9 },
                { id: "a", score: 0.5 },
            ]),
        ).toBe(3);
    });

    // Whichever candidate repeats first wins, and it takes a repeat: two candidates trading the
    // lead confirm nothing, which is the state a shifting frame produces.
    it("confirms nothing while two candidates trade the lead", () => {
        expect(confirmsOn([{ id: "a" }, { id: "b" }])).toBe(0);
    });

    it("waits for a repeat rather than settling on the higher score", () => {
        expect(
            confirmsOn([
                { id: "b", score: 0.9 },
                { id: "a", score: 0.5 },
            ]),
        ).toBe(0);
    });

    // A name read off the card outranks a resemblance to it, whatever the numbers say.
    it("lets a named reading beat a better-scoring lookalike", () => {
        expect(
            confirmsOn([
                { id: "b", score: 0.9, named: false },
                { id: "a", score: 0.1, named: true },
                { id: "a", score: 0.1, named: true },
            ]),
        ).toBe(3);
    });

    it("refuses an unnamed leader while a named rival is in the window", () => {
        expect(
            confirmsOn([
                { id: "b", score: 0.1, named: true },
                { id: "a", score: 0.9, named: false },
                { id: "a", score: 0.9, named: false },
            ]),
        ).toBe(0);
    });

    it("forgets the window on reset", () => {
        const tracker = createAgreementTracker();
        expect(tracker.seen("a", 0.5, false)).toBe(false);
        tracker.reset();
        expect(tracker.seen("a", 0.5, false)).toBe(false);
    });
});
