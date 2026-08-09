import { describe, expect, it } from "vitest";
import { FRESH_GUIDE_HISTORY, mayAddSameCard, mayScanAgain, observeGuide, thumbDiff } from "./live-scan-gate";
import type { GuideHistory, GuideObservation } from "./live-scan-gate";

const CHANGE_DIFF = 12;
const thumb = (value: number) => new Float32Array(24 * 33).fill(value);
const card = (luma: Float32Array): GuideObservation => ({ present: true, luma });
const empty: GuideObservation = { present: false, luma: thumb(8) };

/**
 * Replays a series of guide observations against a freshly added card
 *
 * @param added
 * @param observations
 * @returns
 */
function watch(added: Float32Array, observations: GuideObservation[]): GuideHistory {
    return observations.reduce(
        (history, observation) => observeGuide(history, observation, added, CHANGE_DIFF),
        FRESH_GUIDE_HISTORY,
    );
}

describe("live scan guide history", () => {
    it("stays put while the added card simply lies in the guide", () => {
        const added = thumb(120);
        const history = watch(added, [card(thumb(121)), card(thumb(119)), card(added)]);
        expect(mayScanAgain(history)).toBe(false);
        expect(mayAddSameCard(history)).toBe(false);
    });

    it("releases when the next card of a stack appears in the same place", () => {
        // The bug this replaced: no empty frame is ever observed, the guide just shows another card.
        const history = watch(thumb(120), [card(thumb(180))]);
        expect(mayScanAgain(history)).toBe(true);
    });

    it("does NOT allow re-adding the same card after mere movement over it", () => {
        // A hand passing across the added card changes the picture, so scanning again is fine —
        // but the card never left, so adding it a second time must stay blocked.
        const added = thumb(120);
        const history = watch(added, [card(thumb(40)), card(added), card(added)]);
        expect(mayScanAgain(history)).toBe(true);
        expect(mayAddSameCard(history)).toBe(false);
    });

    it("allows a second identical copy once the guide was convincingly empty", () => {
        const added = thumb(120);
        const history = watch(added, [empty, empty, card(added)]);
        expect(mayAddSameCard(history)).toBe(true);
    });

    it("does not unlock a repeat on a single stray empty frame", () => {
        // A dark card or a motion-blurred sample can dip below the presence threshold once. Treating
        // that as a removal re-adds the card that never left — the double-count the user sees.
        const added = thumb(120);
        const history = watch(added, [card(added), empty, card(added), card(added)]);
        expect(mayAddSameCard(history)).toBe(false);
    });

    it("keeps both observations once made, so a transient between samples is not lost", () => {
        const added = thumb(120);
        // Single empty sample, then many steady ones showing the same picture again.
        const history = watch(added, [empty, empty, card(added), card(added), card(added)]);
        expect(mayScanAgain(history)).toBe(true);
        expect(mayAddSameCard(history)).toBe(true);
    });

    it("treats a missing reference thumbnail as 'anything goes'", () => {
        const history = observeGuide(FRESH_GUIDE_HISTORY, card(thumb(120)), null, CHANGE_DIFF);
        expect(mayScanAgain(history)).toBe(true);
    });

    it("treats mismatched thumbnails as maximally different rather than crashing", () => {
        expect(thumbDiff(new Float32Array(4), new Float32Array(8))).toBe(Infinity);
    });
});
