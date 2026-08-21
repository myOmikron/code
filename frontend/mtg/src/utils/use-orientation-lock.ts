/**
 * Keeping a page the way round it was opened.
 *
 * A device that lies flat on the table has no up: the smallest nudge flips the
 * seating around while a game is running. The screen orientation lock pins the
 * page to the orientation it is already in, so the tiles stay where the players
 * left them.
 *
 * It needs an installed app or a fullscreen page on most browsers and is not
 * offered at all on desktop, which is why nothing here reports failure.
 */

import { useEffect } from "react";

/**
 * Pins the screen to its current orientation while it is wanted.
 *
 * @param wanted whether the orientation should be held
 */
export function useOrientationLock(wanted: boolean): void {
    useEffect(() => {
        if (!wanted) return;

        const orientation: ScreenOrientation | undefined = window.screen.orientation;
        if (orientation === undefined || typeof orientation.lock !== "function") return;

        let dropped = false;
        orientation.lock(orientation.type).then(
            () => {
                if (dropped) orientation.unlock();
            },
            () => {
                // Desktops and browsers outside an installed app simply keep turning.
            },
        );

        return () => {
            dropped = true;
            orientation.unlock();
        };
    }, [wanted]);
}
