/**
 * Avoids repeating inference on an already recognised, unchanged camera image.
 *
 * @returns a small-image comparison gate with a periodic recheck
 */
export function createScanRest() {
    let held: Uint8ClampedArray | null = null;
    let until = 0;
    return {
        /**
         * Remember the image that was successfully recognised.
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
