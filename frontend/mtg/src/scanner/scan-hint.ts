//! Damps the viewfinder's advice so it does not change faster than a hand can follow.
import type { Shortcoming } from "./frame-gate";

/** Tuning for {@link createScanHint}. */
export const SCAN_HINT_OPTIONS = {
    /** How long advice stays up once shown, in ms */
    dwell: 1200,
    /** Frames in a row that must agree before one complaint replaces another */
    confirmations: 2,
};

/**
 * Turns per-frame complaints into steady advice: the first shows at once, a different one needs
 * two frames in a row, and none is taken down before it has been up for `dwell`.
 *
 * @param options
 * @returns the damper
 */
export function createScanHint(options = SCAN_HINT_OPTIONS) {
    let shown: Shortcoming | null = null;
    let until = 0;
    let candidate: Shortcoming | null = null;
    let agreed = 0;

    const show = (shortcoming: Shortcoming, now: number) => {
        shown = shortcoming;
        until = now + options.dwell;
        candidate = null;
        agreed = 0;
    };

    return {
        /**
         * Records one frame's worst complaint.
         *
         * @param shortcoming null for a clean frame
         * @param now time in ms
         * @returns the complaint to display
         */
        observe(shortcoming: Shortcoming | null, now: number): Shortcoming | null {
            if (!shortcoming) {
                candidate = null;
                agreed = 0;
                if (now >= until) shown = null;
            } else if (!shown || shortcoming === shown) {
                show(shortcoming, now);
            } else {
                agreed = shortcoming === candidate ? agreed + 1 : 1;
                candidate = shortcoming;
                if (agreed >= options.confirmations) show(shortcoming, now);
            }
            return shown;
        },
        /** Takes the advice down at once. */
        clear() {
            shown = null;
            until = 0;
            candidate = null;
            agreed = 0;
        },
    };
}
