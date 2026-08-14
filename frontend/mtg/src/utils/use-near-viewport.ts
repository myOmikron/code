/**
 * Telling a component whether it is worth drawing yet.
 *
 * Everything on a page renders in one commit, however far down it sits. That is
 * free for text and expensive for anything that measures itself and lays out an
 * svg — a screenful of charts costs seconds of blocked main thread for drawings
 * nobody has scrolled to. This hook is how a component gets to wait.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * How far outside the viewport counts as near.
 *
 * Roughly a screen's worth of scrolling: enough that a chart is finished by the
 * time it is reached, little enough that landing on the page draws only what is
 * actually on it.
 */
const NEAR_MARGIN = "400px";

/**
 * Watches an element and reports once it has come close to the viewport.
 *
 * The answer only ever flips from false to true — something already drawn stays
 * drawn, because tearing it down on scroll-away would pay the same cost again
 * on the way back.
 *
 * @returns the ref to put on the element, and whether it is near enough to draw
 */
export function useNearViewport<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
    const ref = useRef<T>(null);
    // Without an observer — jsdom, a browser old enough to lack it — everything
    // draws at once, which is the behaviour this replaces rather than a failure.
    const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");

    useEffect(() => {
        const element = ref.current;
        if (near || element === null) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) setNear(true);
            },
            { rootMargin: NEAR_MARGIN },
        );
        observer.observe(element);

        return () => observer.disconnect();
    }, [near]);

    return [ref, near];
}
