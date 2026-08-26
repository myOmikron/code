/**
 * Filling the screen with the page the table is playing on.
 *
 * A life counter lying between four players competes with a browser's address
 * bar and toolbars for the little screen it has. Fullscreen hands those pixels
 * to the tiles, and on most browsers it is also what lets
 * {@link useOrientationLock} pin the page the way round it was put down.
 *
 * An installed app is left alone: it has no address bar to hide, so a
 * fullscreen request there buys nothing and costs the browser's "you are now
 * in fullscreen" notice, which sits over the tiles for seconds and cannot be
 * dismissed or shortened by the page.
 *
 * The state is read back from the document rather than remembered, because the
 * user can leave fullscreen without touching the button (Escape, the system
 * gesture, another tab), and a toggle that disagrees with the screen is worse
 * than none.
 */

import { useEffect, useState } from "react";

/** Whether the page is filling the screen, and how to change that */
export type Fullscreen = {
    /**
     * Whether asking for fullscreen is worth it here: iPhones do not offer it,
     * and an installed app is already filling the screen.
     */
    supported: boolean;
    /** Whether the page is filling the screen right now */
    active: boolean;
    /** Enters fullscreen, or leaves it */
    toggle: () => void;
    /** Takes the screen, if it is not already taken */
    enter: () => void;
};

/**
 * Follows and controls the page's fullscreen state.
 *
 * @param releaseOnLeave whether leaving the page gives the screen back, which
 *   a page that took it for one task wants: the screen was taken for that task
 *   and the browser has no reason to still be filling it afterwards
 *
 * @returns what fullscreen is doing, and the two ways to change it
 */
export function useFullscreen(releaseOnLeave: boolean = false): Fullscreen {
    const [active, setActive] = useState(false);
    const [installed] = useState(standalone);

    useEffect(() => {
        /** Reads the state back off the document, however it changed */
        function follow() {
            setActive(document.fullscreenElement !== null);
        }

        follow();
        document.addEventListener("fullscreenchange", follow);
        return () => document.removeEventListener("fullscreenchange", follow);
    }, []);

    useEffect(() => {
        if (!releaseOnLeave) return;
        return () => {
            if (document.fullscreenElement === null) return;
            void document.exitFullscreen().catch(() => undefined);
        };
    }, [releaseOnLeave]);

    /**
     * Fills the screen.
     *
     * Only ever worth calling straight out of a tap: browsers grant fullscreen
     * to a trusted gesture and refuse it otherwise, as they do on the browsers
     * that only allow it for a video. Nothing to report either way, the page
     * stays as it is and every tile keeps working.
     */
    function enter() {
        if (installed || document.fullscreenElement !== null) return;
        void document.documentElement.requestFullscreen().catch(() => undefined);
    }

    /** Fills the screen, or gives it back */
    function toggle() {
        if (document.fullscreenElement === null) {
            enter();
        } else {
            void document.exitFullscreen().catch(() => undefined);
        }
    }

    return {
        supported: !installed && typeof document.documentElement.requestFullscreen === "function",
        active,
        toggle,
        enter,
    };
}

/**
 * Whether the page is running as an installed app rather than in a tab
 *
 * @returns whether the browser's own chrome is already out of the way
 */
function standalone(): boolean {
    return ["standalone", "fullscreen", "minimal-ui"].some(
        (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    );
}
