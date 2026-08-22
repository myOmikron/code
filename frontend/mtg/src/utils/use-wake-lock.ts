/**
 * Keeping the screen on while a page is watched rather than touched.
 *
 * A life tracker lies on the table for whole turns without a tap, which is
 * exactly when a phone dims and locks. The screen wake lock asks the device not
 * to, for as long as the page is on top: browsers drop it whenever the page is
 * hidden, so it is taken again every time the page comes back.
 *
 * It needs a secure context (https or localhost) and is quietly ignored where
 * it is unavailable or refused, which is why nothing here reports failure.
 */

import { useEffect } from "react";

/**
 * Holds a screen wake lock while it is wanted and the page is on screen.
 *
 * @param wanted whether the screen should be kept on
 */
export function useWakeLock(wanted: boolean): void {
    useEffect(() => {
        if (!wanted || !("wakeLock" in navigator)) return;

        let held: WakeLockSentinel | null = null;
        let dropped = false;

        /** Takes the lock, unless one is already held or the page is away */
        async function hold() {
            if (document.visibilityState !== "visible") return;
            if (held !== null && !held.released) return;
            try {
                const sentinel = await navigator.wakeLock.request("screen");
                if (dropped) {
                    await sentinel.release();
                    return;
                }
                held = sentinel;
            } catch {
                // Battery savers and unsupported devices simply keep dimming.
            }
        }

        /** Takes it again once the page is back on top */
        function recover() {
            void hold();
        }

        void hold();
        document.addEventListener("visibilitychange", recover);

        return () => {
            dropped = true;
            document.removeEventListener("visibilitychange", recover);
            void held?.release();
            held = null;
        };
    }, [wanted]);
}
