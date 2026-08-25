/**
 * The foil sheen following the phone.
 *
 * On a desk the sheen answers the pointer: hovering a foil brightens it. A
 * phone has no pointer, and a foil held in the hand is exactly the thing that
 * only shows itself when it is moved. This turns the device's orientation into
 * the light source, so tilting the phone runs the rainbow across the card the
 * way turning a real one does.
 *
 * Nothing here re-renders. The reading is written as custom properties onto
 * `<html>`, and every {@link FoilFrame} on the page inherits them from there —
 * a binder page of two hundred thumbnails costs three style writes a frame
 * instead of two hundred React updates.
 *
 * iOS gates `deviceorientation` behind a permission that can only be asked for
 * from a user gesture, which is why turning this on is a switch in the settings
 * rather than something the app does by itself: the switch is the gesture. Once
 * granted, later visits pick the permission back up on the first touch.
 */

/** The `localStorage` key */
const STORAGE_KEY = "foil-tilt";

/**
 * How far the phone is turned, in degrees, for the sheen to run all the way
 * across.
 *
 * Thirteen, not the twenty-six it started at: a card is looked at by rocking
 * the wrist, not by turning the phone over, and the far end of the travel has
 * to be reachable inside that. Halving this doubles how much sheen a given tilt
 * buys without moving the band any further — the travel itself is bounded by
 * the layer's margin and lives in `TRAVEL`.
 */
const RANGE = 13;

/** How much of the way to the latest reading the sheen moves each frame */
const EASE = 0.12;

/** How fast "level" follows the way the phone is actually being held */
const DRIFT = 0.005;

/** Below this the sheen has arrived and the loop sleeps until the next reading */
const SETTLED = 0.0015;

/** How long a device gets to produce its first reading before it counts as having none */
const FIRST_READING = 1000;

/**
 * How far the sheen travels, in percent of the oversized layer it is painted on.
 *
 * Bounded by that layer's margin, and not by taste: the layers are three times
 * the card, so half a card of travel here is a card and a half on screen for
 * the fastest of them, and anything past the margin drags the layer's own edge
 * into view as a line across the artwork. See `TILT_LAYER` in `foil-frame.tsx`
 * for the sum.
 */
const TRAVEL = 14;

/** The class marking that the sheen is live, which is what swaps the layers over */
const LIVE = "foil-tilt";

/** A reading, with both axes running -1 to 1 */
type Tilt = { x: number; y: number };

/** iOS' addition to the constructor, absent everywhere else */
type PermissionApi = { requestPermission: () => Promise<PermissionState | "default"> };

/** Whoever is watching the switch */
const subscribers = new Set<() => void>();

/** Whether the listener is attached right now */
let running = false;

/** Whether the sensor has been cleared for reading in this session */
let acquired = false;

/** Whether a reading has ever arrived, which is the only proof the sensor is really there */
let reading = false;

/** Which way the phone is held when the sheen sits in the middle */
let level: { beta: number; gamma: number } | null = null;

/** The latest reading */
let target: Tilt = { x: 0, y: 0 };

/** Where the sheen is on its way there */
let shown: Tilt = { x: 0, y: 0 };

/** The pending frame, `0` while the loop sleeps */
let frame = 0;

/**
 * Whether asking the device is a thing this browser needs permission for
 *
 * @returns `true` on iOS
 */
function gated(): boolean {
    return typeof (DeviceOrientationEvent as unknown as PermissionApi).requestPermission === "function";
}

/**
 * Whether the sheen can follow anything on this device.
 *
 * A laptop with a lid sensor reports orientation too, but a screen that does
 * not move has nothing to say — the pointer already lights those cards up.
 *
 * @returns `true` where the switch is worth showing
 */
export function foilTiltSupported(): boolean {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return false;
    if (typeof window.matchMedia !== "function") return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Whether the sheen is set to follow the phone.
 *
 * Where no permission is needed this is on unless it was turned off; where one
 * is, it is off until it was turned on, because turning it on is what asks.
 *
 * @returns the stored choice
 */
export function foilTiltEnabled(): boolean {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "on") return true;
    if (stored === "off") return false;
    return !gated();
}

/**
 * Follows the switch
 *
 * @param onChange what to call when it flips
 *
 * @returns a function removing the listener again
 */
export function subscribeFoilTilt(onChange: () => void): () => void {
    subscribers.add(onChange);
    return () => subscribers.delete(onChange);
}

/** What was last written, so a frame that changed nothing costs nothing */
const written = new Map<string, string>();

/**
 * Writes one property, if it says anything new.
 *
 * These are inherited properties on the root, so every write invalidates the
 * style of everything below it — on a page of two hundred thumbnails that is
 * worth not doing twice for the same value.
 *
 * @param name the property
 * @param value its length
 */
function set(name: string, value: string) {
    if (written.get(name) === value) return;
    written.set(name, value);
    document.documentElement.style.setProperty(name, value);
}

/**
 * Turns one reading into what the sheen is drawn from.
 *
 * Two offsets, and nothing else: which colours come up is decided by what the
 * band is passing over, not by anything computed here. Both are transforms, so
 * the layers are moved rather than redrawn — feeding the tilt into the colour
 * stops instead would repaint every gradient on the page sixty times a second.
 */
function paint() {
    set("--foil-tx", `${(shown.x * TRAVEL).toFixed(2)}%`);
    set("--foil-ty", `${(shown.y * TRAVEL).toFixed(2)}%`);
}

/** Puts the sheen back in the middle, for when the following stops */
function clear() {
    for (const name of written.keys()) document.documentElement.style.removeProperty(name);
    written.clear();
}

/**
 * Eases the sheen towards the latest reading, one frame at a time
 */
function step() {
    frame = 0;

    shown = { x: shown.x + (target.x - shown.x) * EASE, y: shown.y + (target.y - shown.y) * EASE };
    paint();

    const left = Math.abs(target.x - shown.x) + Math.abs(target.y - shown.y);
    if (left > SETTLED) frame = requestAnimationFrame(step);
}

/**
 * Keeps a reading inside the range the sheen is drawn for
 *
 * @param degrees how far off level the phone is
 *
 * @returns the reading, -1 to 1
 */
function scale(degrees: number): number {
    return Math.max(-1, Math.min(1, degrees / RANGE));
}

/**
 * Takes a reading off the device.
 *
 * The first one becomes level: a phone read on a train, in bed or flat on a
 * table would otherwise start with the sheen pinned to whichever corner that
 * posture happens to point at. Level then drifts towards however the phone is
 * being held, so settling into a new posture recentres the sheen instead of
 * leaving it stuck against the stop.
 *
 * @param event the reading
 */
function onOrientation(event: DeviceOrientationEvent) {
    const { beta, gamma } = event;
    if (beta === null || gamma === null) return;

    if (!reading) {
        reading = true;
        // Only now, with a reading in hand, are the moving layers worth
        // swapping in: a browser that blocks the sensor keeps the still ones.
        document.documentElement.classList.add(LIVE);
    }

    if (level === null) level = { beta, gamma };
    else level = { beta: level.beta + (beta - level.beta) * DRIFT, gamma: level.gamma + (gamma - level.gamma) * DRIFT };

    const x = scale(gamma - level.gamma);
    const y = scale(beta - level.beta);

    // `beta` and `gamma` are named for the device, not for the screen: turning
    // the phone sideways swaps which of them runs across the card.
    const angle = typeof screen !== "undefined" ? (screen.orientation?.angle ?? 0) : 0;
    if (angle === 90) target = { x: y, y: -x };
    else if (angle === 180) target = { x: -x, y: -y };
    else if (angle === 270) target = { x: -y, y: x };
    else target = { x, y };

    if (frame === 0) frame = requestAnimationFrame(step);
}

/** Stops following, leaving the sheen where a desk browser has it */
function stop() {
    if (!running) return;
    running = false;
    window.removeEventListener("deviceorientation", onOrientation);
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    document.documentElement.classList.remove(LIVE);
    level = null;
    target = { x: 0, y: 0 };
    shown = { x: 0, y: 0 };
    clear();
}

/** Starts following, if it is not already */
function listen() {
    if (running) return;
    running = true;
    window.addEventListener("deviceorientation", onOrientation);
}

/**
 * Asks iOS for the sensor, if it is iOS asking
 *
 * @returns whether the sensor may be read
 */
async function permitted(): Promise<boolean> {
    if (!gated()) {
        acquired = true;
        return true;
    }
    try {
        acquired = (await (DeviceOrientationEvent as unknown as PermissionApi).requestPermission()) === "granted";
        return acquired;
    } catch {
        // Thrown when the call did not come out of a user gesture, which is not
        // a refusal — the switch will ask again the next time it is touched.
        return false;
    }
}

/**
 * How turning the sheen on went.
 *
 * `"silent"` is the case worth having a name for: the browser took the
 * listener, said nothing, and never sent a reading. Brave blocks motion sensors
 * by default and this is exactly what that looks like from here, as does a page
 * served over plain http, where the sensor is not offered at all.
 */
export type FoilTiltResult = "on" | "off" | "denied" | "silent";

/**
 * Waits for the device to say something.
 *
 * @returns whether a reading arrived
 */
async function listening(): Promise<boolean> {
    if (reading) return true;
    await new Promise((resolve) => setTimeout(resolve, FIRST_READING));
    return reading;
}

/**
 * Flips the switch, asking for the sensor on the way in and then checking that
 * the answer was more than a yes.
 *
 * @param enabled what it was flipped to
 *
 * @returns what came of it
 */
export async function setFoilTilt(enabled: boolean): Promise<FoilTiltResult> {
    if (!enabled) {
        localStorage.setItem(STORAGE_KEY, "off");
        stop();
        for (const subscriber of subscribers) subscriber();
        return "off";
    }

    const allowed = await permitted();
    if (!allowed) {
        localStorage.setItem(STORAGE_KEY, "off");
        for (const subscriber of subscribers) subscriber();
        return "denied";
    }

    listen();
    // Stored before the wait: the switch is on from the user's point of view
    // the moment it was granted, and a browser that stays quiet is something to
    // report rather than a reason to forget the choice.
    localStorage.setItem(STORAGE_KEY, "on");
    for (const subscriber of subscribers) subscriber();

    return (await listening()) ? "on" : "silent";
}

/**
 * Starts following where the choice says to, and keeps it that way.
 *
 * Called once at startup. Where the sensor is gated the permission cannot be
 * asked for here — there has been no gesture yet — so the first touch anywhere
 * in the app is used instead; on a browser that already granted it that call
 * resolves without showing anything.
 *
 * @returns a function stopping it again
 */
export function watchFoilTilt(): () => void {
    if (!foilTiltSupported() || !foilTiltEnabled()) return () => {};

    if (!gated()) {
        acquired = true;
        listen();
    } else {
        /** Picks the granted permission back up on the way past */
        const onFirstTouch = () => {
            void permitted().then((allowed) => {
                if (allowed && foilTiltEnabled()) listen();
            });
        };
        window.addEventListener("pointerdown", onFirstTouch, { once: true });
    }

    /** A phone in a pocket is still being turned, and none of it is being looked at */
    const onVisibility = () => {
        if (document.visibilityState === "hidden") stop();
        else if (acquired && foilTiltEnabled()) listen();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        stop();
    };
}
