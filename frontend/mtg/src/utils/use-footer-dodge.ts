import { useEffect, useState } from "react";

/**
 * How far a floating bar has to rise to leave the footer strip alone.
 *
 * A bar pinned to the bottom edge sits on top of whatever the page ends with,
 * and what this app ends with is the footer carrying the imprint and the
 * privacy policy. Those two must stay reachable, so the bar rides up as the
 * footer scrolls into view and drops back to the edge as it leaves: while the
 * page is scrolled anywhere above its end, the bar keeps the whole strip it
 * had.
 *
 * Measured against the footer itself rather than against a fixed offset,
 * because the footer is in the flow: on a long page it is off screen, on a
 * short one it sits at the bottom from the start, and only its actual position
 * tells the two apart.
 */

/** The attribute the footer is found by */
export const FOOTER_MARKER = "data-app-footer";

/**
 * How many pixels a bottom-pinned element has to rise to clear the footer
 *
 * @returns the offset, `0` while the footer is out of view or absent
 */
export function useFooterDodge(): number {
    const [lift, setLift] = useState(0);

    useEffect(() => {
        const footer = document.querySelector<HTMLElement>(`[${FOOTER_MARKER}]`);
        if (footer === null) return;

        let frame: number | null = null;
        const measure = () => {
            frame = null;
            const { top } = footer.getBoundingClientRect();
            setLift(Math.max(0, Math.round(window.innerHeight - top)));
        };
        // Scrolling fires far more often than the layout changes, so the read
        // is held to one per frame — it forces a layout, and a bar that lags a
        // frame behind the footer is not something an eye catches.
        const schedule = () => {
            frame ??= requestAnimationFrame(measure);
        };

        measure();
        // Captured, because the page a deck is read on may scroll inside an
        // element of its own, and a scroll event does not bubble.
        window.addEventListener("scroll", schedule, { passive: true, capture: true });
        window.addEventListener("resize", schedule);
        const observer = new ResizeObserver(schedule);
        observer.observe(document.documentElement);

        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
            window.removeEventListener("scroll", schedule, { capture: true });
            window.removeEventListener("resize", schedule);
            observer.disconnect();
        };
    }, []);

    return lift;
}
