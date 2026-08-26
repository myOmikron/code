/**
 * Keeping the screen on while a page is watched rather than touched.
 *
 * A life tracker lies on the table for whole turns without a tap, which is
 * exactly when a phone dims and locks.
 *
 * There are two ways to ask for that, and which one is available splits along
 * how old the device is. The screen wake lock is the one to use where it
 * exists; safari only learned it in 16.4, so an ipad a version or two behind
 * has no way of being asked and goes to sleep mid-game. What every browser has
 * always agreed on is that a page playing a video is a page being watched, so
 * where the lock is missing a silent one loops out of sight instead.
 *
 * Both are quietly given up on when refused. A battery saver that dims the
 * screen anyway is not something a page can argue with, and reporting it would
 * only put a message on a table that is mid-game.
 */

import { useEffect } from "react";
import { QUIET_VIDEO } from "src/utils/quiet-video";

/** Holds the screen open while the page is on screen, however this browser lets it */
export function useWakeLock(): void {
    // The choice is the browser's, not the device's state, so it is made once
    // and not revisited: a browser that has the lock keeps having it, and one
    // that refuses the request is refusing to keep the screen on — a video is
    // not a way round that answer, only round a missing api.
    useEffect(() => ("wakeLock" in navigator ? holdLock() : loopVideo()), []);
}

/**
 * Takes a screen wake lock, and takes it again after every trip away.
 *
 * Browsers drop the lock whenever the page is hidden, and the page comes back
 * without it.
 *
 * @returns the way to give it back
 */
function holdLock(): () => void {
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
}

/**
 * Loops {@link QUIET_VIDEO} out of sight, for the browsers with no lock to take.
 *
 * @returns the way to stop it
 */
function loopVideo(): () => void {
    const video = document.createElement("video");
    video.src = QUIET_VIDEO;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    // The properties above are what current browsers read; the attributes are
    // for the older webkit this exists for in the first place, which decides
    // whether a video may play inline and without a tap from the markup.
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    // Out of sight, but drawn: a video that is not rendered at all is a video
    // the browser is free to stop, and a stopped video holds nothing open.
    video.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.append(video);

    /**
     * Gets it going, and arranges for the next tap to try again if it was not
     * allowed to.
     *
     * A muted inline video may autoplay, but not on every version and not in
     * every setting, and a refusal is final until a gesture asks again. The
     * listener is dropped as soon as one play goes through, so a game is not
     * paying for this on every tap.
     */
    function play() {
        if (document.visibilityState !== "visible") return;
        void video.play().then(
            () => document.removeEventListener("pointerdown", play),
            () => document.addEventListener("pointerdown", play),
        );
    }

    play();
    // Coming back from the home screen or another tab: ios pauses it on the way
    // out, and nothing restarts it on the way in.
    document.addEventListener("visibilitychange", play);
    // `loop` is what repeats it; this is for the versions that ignore `loop`.
    video.addEventListener("ended", play);

    return () => {
        document.removeEventListener("visibilitychange", play);
        document.removeEventListener("pointerdown", play);
        video.removeEventListener("ended", play);
        video.pause();
        // Both, in this order: the element is what leaves the document, and the
        // empty load is what lets go of the decoder it was holding.
        video.removeAttribute("src");
        video.load();
        video.remove();
    };
}
