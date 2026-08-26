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
 *
 * Every read goes through the helpers at the bottom of this file, which speak
 * both the standard api and safari's `webkit` one. Both halves matter on an
 * ipad: asking the unprefixed way does nothing there, and — worse — reading the
 * unprefixed way answers `undefined`, which is not `null` and would report a
 * page that fills the screen when it does not.
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
            setActive(filling());
        }

        follow();
        return onFullscreenChange(follow);
    }, []);

    useEffect(() => {
        if (!releaseOnLeave) return;
        return () => {
            if (!filling()) return;
            leave();
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
        if (installed || filling()) return;
        const request =
            document.documentElement.requestFullscreen ??
            (document.documentElement as WebkitElement).webkitRequestFullscreen;
        if (request === undefined) return;
        void Promise.resolve(request.call(document.documentElement)).catch(() => undefined);
    }

    /** Fills the screen, or gives it back */
    function toggle() {
        if (filling()) {
            leave();
        } else {
            enter();
        }
    }

    return {
        supported: !installed && offered(),
        active,
        toggle,
        enter,
    };
}

/** The fullscreen api as safari spells it, which is the only one an ipad has */
type WebkitDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitFullscreenEnabled?: boolean;
    webkitExitFullscreen?: () => Promise<void> | void;
};

/** The half of safari's fullscreen api that lives on the element */
type WebkitElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
};

/**
 * Whether the page is filling the screen right now
 *
 * @returns whether anything on the page holds the screen
 */
function filling(): boolean {
    const held = document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement;
    return held !== null && held !== undefined;
}

/** Gives the screen back, however this browser spells it */
function leave() {
    const exit = document.exitFullscreen ?? (document as WebkitDocument).webkitExitFullscreen;
    if (exit === undefined) return;
    void Promise.resolve(exit.call(document)).catch(() => undefined);
}

/**
 * Whether this browser hands the screen to a page at all
 *
 * The `enabled` flag is what separates an ipad, which grants it, from an
 * iphone, which carries the prefixed methods but only ever fullscreens a video.
 *
 * @returns whether asking is worth it
 */
function offered(): boolean {
    const allowed = document.fullscreenEnabled ?? (document as WebkitDocument).webkitFullscreenEnabled ?? false;
    const request =
        document.documentElement.requestFullscreen ??
        (document.documentElement as WebkitElement).webkitRequestFullscreen;
    return allowed && request !== undefined;
}

/**
 * Follows fullscreen changes, whichever event this browser sends.
 *
 * @param listener what to run when the state may have changed
 *
 * @returns the way to stop listening
 */
export function onFullscreenChange(listener: () => void): () => void {
    document.addEventListener("fullscreenchange", listener);
    document.addEventListener("webkitfullscreenchange", listener);
    return () => {
        document.removeEventListener("fullscreenchange", listener);
        document.removeEventListener("webkitfullscreenchange", listener);
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
