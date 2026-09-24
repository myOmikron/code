/**
 * Avoids repeating inference on an unchanged camera image that has already had its answer: a card
 * that was recognised, or a guide with nothing in it.
 *
 * @returns a small-image comparison gate with a periodic recheck
 */
export function createScanRest() {
    let held: Uint8ClampedArray | null = null;
    let until = 0;
    return {
        /**
         * Remember an image that needs no second look: a recognised card, or an empty guide.
         *
         * @param pixels tiny RGBA camera sample
         * @param now monotonic time in milliseconds
         */
        hold(pixels: Uint8ClampedArray, now: number) {
            held = pixels.slice();
            until = now + 5000;
        },
        /**
         * Allow changed images immediately, and unchanged ones every five seconds.
         *
         * @param pixels tiny RGBA camera sample
         * @param now monotonic time in milliseconds
         * @returns whether expensive recognition is needed
         */
        needsScan(pixels: Uint8ClampedArray, now: number): boolean {
            if (!held || held.length !== pixels.length || now >= until) return true;
            let difference = 0;
            for (let i = 0; i < pixels.length; i++) {
                if (i % 4 !== 3) difference += Math.abs(pixels[i] - held[i]);
            }
            if (difference / (pixels.length * 0.75) < 10) return false;
            held = null;
            return true;
        },
        /** Clear the held image when camera or scan settings change. */
        reset() {
            held = null;
        },
    };
}
