import { type RefObject, useCallback, useEffect, useRef } from "react";

/** Share of the sheet's height a drag must pass to close it on release */
const CLOSE_SHARE = 0.25;
/** A downward flick faster than this closes the sheet however short it was, in px/ms */
const CLOSE_VELOCITY = 0.5;
/** Movement before a touch counts as a drag or a scroll, in px */
const SLOP = 8;
/** Duration of the slide after release, in ms */
const SETTLE_MS = 220;
/** The curve iOS sheets settle with */
const SETTLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/** One touch on the sheet, from touchstart to touchend */
type Gesture = {
    /** Where the touch started, or for a drag where it began to move the sheet */
    startX: number;
    /** See {@link Gesture.startX} */
    startY: number;
    /** `pending` until the touch has moved far enough to tell a drag from a scroll */
    mode: "pending" | "drag";
    /** How far the sheet is pulled down, in px */
    offset: number;
    /** The latest touchmove, for the velocity */
    lastY: number;
    /** See {@link Gesture.lastY} */
    lastT: number;
    /** Downward speed at the latest touchmove, in px/ms */
    velocity: number;
};

/**
 * Lets a phone close a bottom sheet by swiping it down, from its handle
 * (`data-sheet-handle`) or from content scrolled to the top
 *
 * @param onClose Called once the sheet has slid out
 * @returns Refs for the sheet's panel and for the backdrop that fades with it
 */
export function useSheetDrag(onClose: () => void) {
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });
    const backdrop = useRef<HTMLDivElement>(null);
    const panel = useCallback((el: HTMLDivElement | null) => {
        if (el) return attach(el, backdrop, () => onCloseRef.current());
    }, []);
    return { panel, backdrop };
}

/**
 * Listens for the swipe on a sheet
 *
 * @param sheet The sheet's panel
 * @param backdrop The backdrop that fades as the sheet is pulled down
 * @param onClose Called once the sheet has slid out
 * @returns Removes the listeners
 */
function attach(sheet: HTMLElement, backdrop: RefObject<HTMLElement | null>, onClose: () => void) {
    let gesture: Gesture | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Moves the sheet and fades the backdrop with it
     *
     * @param offset Pull in px, `undefined` to hand both back to their classes
     * @param ms Animate over this long, or follow the finger at once
     */
    function pull(offset: number | undefined, ms?: number) {
        const ease = `${ms}ms ${SETTLE_EASE}`;
        sheet.style.transition = ms === undefined ? "none" : `transform ${ease}`;
        sheet.style.transform = offset === undefined ? "" : `translateY(${offset}px)`;
        const fade = backdrop.current?.style;
        if (!fade) return;
        fade.transition = ms === undefined ? "none" : `opacity ${ease}`;
        fade.opacity = offset === undefined ? "" : String(Math.max(0, 1 - offset / sheet.offsetHeight));
    }

    /**
     * Slides the sheet out and closes it, or back up
     *
     * @param close Which of the two
     */
    function settle(close: boolean) {
        const ms = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : SETTLE_MS;
        clearTimeout(timer);
        if (!close) {
            pull(undefined, ms);
            timer = setTimeout(() => {
                sheet.style.transition = "";
                if (backdrop.current) backdrop.current.style.transition = "";
            }, ms);
            return;
        }
        pull(sheet.offsetHeight, ms);
        timer = setTimeout(() => {
            onClose();
            timer = setTimeout(() => sheet.isConnected && !sheet.hasAttribute("data-closed") && settle(false), 100);
        }, ms);
    }

    /** @param e The touchstart */
    function start(e: TouchEvent) {
        gesture = undefined;
        if (e.touches.length !== 1 || !window.matchMedia?.("(width < 40rem)").matches) return;
        const { clientX, clientY } = e.touches[0];
        const handle = e.target instanceof Element && !!e.target.closest("[data-sheet-handle]");
        gesture = {
            startX: clientX,
            startY: clientY,
            mode: handle ? "drag" : "pending",
            offset: 0,
            lastY: clientY,
            lastT: e.timeStamp,
            velocity: 0,
        };
    }

    /** @param e The touchmove */
    function move(e: TouchEvent) {
        if (!gesture) return;
        const { clientX, clientY } = e.touches[0];
        if (gesture.mode === "pending") {
            const dx = clientX - gesture.startX;
            const dy = clientY - gesture.startY;
            const decided = Math.hypot(dx, dy) >= SLOP;
            if (dy <= Math.abs(dx) || !mayDrag(e.target, sheet)) {
                if (decided) gesture = undefined;
                return;
            }
            e.preventDefault();
            if (!decided) return;
            gesture.mode = "drag";
            gesture.startY = clientY;
        }
        e.preventDefault();
        clearTimeout(timer);
        const dt = e.timeStamp - gesture.lastT;
        if (dt > 0) gesture.velocity = (clientY - gesture.lastY) / dt;
        gesture.lastY = clientY;
        gesture.lastT = e.timeStamp;
        gesture.offset = Math.max(0, clientY - gesture.startY);
        pull(gesture.offset);
    }

    /** @param e The touchend or touchcancel */
    function end(e: TouchEvent) {
        if (gesture?.mode === "drag") {
            const { offset, lastT } = gesture;
            const velocity = e.timeStamp - lastT > 100 ? 0 : gesture.velocity;
            settle(offset > 0 && (offset > sheet.offsetHeight * CLOSE_SHARE || velocity > CLOSE_VELOCITY));
        }
        gesture = undefined;
    }

    sheet.addEventListener("touchstart", start, { passive: true });
    sheet.addEventListener("touchmove", move, { passive: false });
    sheet.addEventListener("touchend", end);
    sheet.addEventListener("touchcancel", end);
    return () => {
        clearTimeout(timer);
        sheet.removeEventListener("touchstart", start);
        sheet.removeEventListener("touchmove", move);
        sheet.removeEventListener("touchend", end);
        sheet.removeEventListener("touchcancel", end);
    };
}

/**
 * Whether a downward swipe starting on `target` may move the sheet rather
 * than scroll something or drive a control that handles its own gestures
 *
 * @param target Where the touch started
 * @param sheet The sheet's panel
 * @returns `false` if anything between them still scrolls up or claims the gesture
 */
function mayDrag(target: EventTarget | null, sheet: HTMLElement) {
    for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
        if (node instanceof HTMLInputElement && node.type === "range") return false;
        const { touchAction, overflowY } = getComputedStyle(node);
        if (touchAction === "none" || touchAction === "pan-x") return false;
        if (node.scrollTop > 0 && (overflowY === "auto" || overflowY === "scroll")) return false;
        if (node === sheet) return true;
    }
    return false;
}
