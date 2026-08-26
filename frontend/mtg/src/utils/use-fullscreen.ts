/**
 * Filling the screen with the page the table is playing on.
 *
 * A life counter lying between four players competes with a browser's address
 * bar and toolbars for the little screen it has. Fullscreen hands those pixels
 * to the tiles, and on most browsers it is also what lets
 * {@link useOrientationLock} pin the page the way round it was put down.
 *
 * The state is read back from the document rather than remembered, because the
 * user can leave fullscreen without touching the button — Escape, the system
 * gesture, another tab — and a toggle that disagrees with the screen is worse
 * than none.
 */

import { useEffect, useState } from "react";

/** Whether the page is filling the screen, and how to change that */
export type Fullscreen = {
    /** Whether the browser offers fullscreen at all — iPhones do not */
    supported: boolean;
    /** Whether the page is filling the screen right now */
    active: boolean;
    /** Enters fullscreen, or leaves it */
    toggle: () => void;
};

/**
 * Follows and controls the page's fullscreen state.
 *
 * @returns what fullscreen is doing, and the toggle
 */
export function useFullscreen(): Fullscreen {
    const [active, setActive] = useState(false);

    useEffect(() => {
        /** Reads the state back off the document, however it changed */
        function follow() {
            setActive(document.fullscreenElement !== null);
        }

        follow();
        document.addEventListener("fullscreenchange", follow);
        return () => document.removeEventListener("fullscreenchange", follow);
    }, []);

    /** Fills the screen, or gives it back */
    function toggle() {
        if (document.fullscreenElement === null) {
            // Refused when the gesture is not trusted, and on browsers that
            // only allow it for a video. Nothing to report: the page stays as
            // it is and every tile keeps working.
            void document.documentElement.requestFullscreen().catch(() => undefined);
        } else {
            void document.exitFullscreen().catch(() => undefined);
        }
    }

    return {
        supported: typeof document.documentElement.requestFullscreen === "function",
        active,
        toggle,
    };
}
