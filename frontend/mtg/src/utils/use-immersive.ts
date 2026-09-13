/**
 * Handing a page the whole screen, on browsers that grant it and on those that
 * do not.
 *
 * Where the fullscreen api is offered, this is that api — see
 * {@link useFullscreen}. Where it is not, on an iphone or on the app installed
 * on any ios device, the page cannot take the screen, but it can still take
 * the window: the menu drops its navbar, its footer and the framing around the
 * content, and the page grows into the whole viewport. On an installed app
 * that is everything a fullscreen request would have won anyway, since there
 * is no address bar left to hide; in a phone browser it is everything short of
 * the toolbars, which no page controls.
 *
 * The two live behind one switch so a page has a single state to size itself
 * against and a single button to offer, instead of hiding the button wherever
 * the api is missing and leaving the phone — the device most often laid on the
 * table — with the chrome around it.
 */

import { useState } from "react";
import { useBareChrome } from "src/context/chrome-context";
import { useFullscreen } from "src/utils/use-fullscreen";

/** Whether the page has the whole window, and how to change that */
export type Immersive = {
    /** Whether the page has the whole window right now, however it got it */
    active: boolean;
    /** Takes the window, if it is not already taken */
    enter: () => void;
    /** Takes the window, or gives it back */
    toggle: () => void;
};

/**
 * Follows and controls whether the page has the whole window.
 *
 * @param releaseOnLeave whether leaving the page gives the screen back, which
 *   only matters where the real fullscreen api is in play: the stand-in is
 *   state of this page and goes with it
 *
 * @returns whether the page has the window, and the two ways to change that
 */
export function useImmersive(releaseOnLeave: boolean = false): Immersive {
    const fullscreen = useFullscreen(releaseOnLeave);
    const [faux, setFaux] = useState(false);
    const active = fullscreen.supported ? fullscreen.active : faux;

    // Asked for in both modes: where fullscreen is real the menu already drops
    // its chrome on its own, and asking twice costs nothing.
    useBareChrome(active);

    /**
     * Takes the window.
     *
     * Where fullscreen is real this has the same rule as {@link useFullscreen}:
     * only worth calling straight out of a tap.
     */
    function enter() {
        if (fullscreen.supported) {
            fullscreen.enter();
        } else {
            setFaux(true);
        }
    }

    /** Takes the window, or gives it back */
    function toggle() {
        if (fullscreen.supported) {
            fullscreen.toggle();
        } else {
            setFaux((current) => !current);
        }
    }

    return { active, enter, toggle };
}
