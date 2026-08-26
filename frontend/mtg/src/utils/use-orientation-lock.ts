/**
 * Keeping a page the way round it was opened.
 *
 * A device that lies flat on the table has no up: the smallest nudge flips the
 * seating around while a game is running. The screen orientation lock pins the
 * page to the orientation it is already in, so the tiles stay where the players
 * left them.
 *
 * It needs an installed app or a fullscreen page on most browsers and is not
 * offered at all on desktop, which is why nothing here reports failure. The
 * fullscreen condition is why the lock is asked for again on every
 * `fullscreenchange`: the setting is usually switched on long before the page
 * fills the screen, and the refusal at that point is final unless it is retried.
 */

import { useEffect } from "react";

/** Pins the screen to the orientation the page was opened in */
export function useOrientationLock(): void {
    useEffect(() => {
        const available: ScreenOrientation | undefined = window.screen.orientation;
        if (available === undefined || typeof available.lock !== "function") return;
        const orientation = available;

        let dropped = false;

        /** Asks for the lock, in whatever orientation the page is in now */
        function hold() {
            orientation.lock(orientation.type).then(
                () => {
                    if (dropped) orientation.unlock();
                },
                () => {
                    // Desktops and browsers outside an installed app simply keep turning.
                },
            );
        }

        hold();
        document.addEventListener("fullscreenchange", hold);

        return () => {
            dropped = true;
            document.removeEventListener("fullscreenchange", hold);
            orientation.unlock();
        };
    }, []);
}
