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
import { quietVideoUrl } from "src/utils/quiet-video";

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
 * The taps a browser accepts as "the user asked for this".
 *
 * Three spellings of one tap, because a refused autoplay is only reconsidered
 * inside a gesture and the old webkit this is for does not send all of them.
 * Whichever arrives first gets the video going and the rest are dropped with
 * it.
 */
const GESTURES = ["pointerdown", "touchend", "click"] as const;

/**
 * Loops the {@link quietVideoUrl} clip out of sight, for the browsers with no lock to take.
 *
 * @returns the way to stop it
 */
function loopVideo(): () => void {
    const { url, release } = quietVideoUrl();
    const video = document.createElement("video");
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // The properties above are what current browsers read; the attributes are
    // for the older webkit this exists for in the first place, which decides
    // whether a video may play inline and without a tap from the markup.
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    // Out of sight, but drawn: a video that is not rendered at all is a video
    // the browser is free to stop, and a stopped video holds nothing open.
    // Hence a hair of opacity rather than none — fully transparent is one of
    // the things that counts as not rendered.
    video.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none";
    document.body.append(video);

    /**
     * Gets it going, and arranges for the next tap to try again if it was not
     * allowed to.
     *
     * A muted inline video may autoplay, but not on every version and not in
     * every setting — low power mode refuses it outright — and a refusal is
     * final until a gesture asks again. The listeners are dropped as soon as
     * one play goes through, so a game is not paying for this on every tap.
     */
    function play() {
        if (document.visibilityState !== "visible") return;
        void Promise.resolve(video.play()).then(waitForNoTap, waitForTap);
    }

    /** Listens for the tap that is allowed to start it */
    function waitForTap() {
        // Capture, because a tile that stops the tap from travelling further is
        // still a tap the browser counts.
        for (const gesture of GESTURES) document.addEventListener(gesture, play, true);
    }

    /** Stops listening, once there is nothing left to ask for */
    function waitForNoTap() {
        for (const gesture of GESTURES) document.removeEventListener(gesture, play, true);
    }

    play();
    // Coming back from the home screen or another tab: ios pauses it on the way
    // out, and nothing restarts it on the way in.
    document.addEventListener("visibilitychange", play);
    // `loop` is what repeats it; this is for the versions that ignore `loop`.
    video.addEventListener("ended", play);
    // A call, an alarm, another tab taking the audio session: ios pauses the
    // video for all of them and leaves it paused.
    video.addEventListener("pause", play);

    return () => {
        document.removeEventListener("visibilitychange", play);
        waitForNoTap();
        video.removeEventListener("ended", play);
        video.removeEventListener("pause", play);
        video.pause();
        // Both, in this order: the element is what leaves the document, and the
        // empty load is what lets go of the decoder it was holding.
        video.removeAttribute("src");
        video.load();
        video.remove();
        release();
    };
}
