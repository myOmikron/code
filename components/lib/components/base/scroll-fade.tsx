"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The properties for {@link ScrollFade}
 */
export type ScrollFadeProps = {
    /**
     * Additional CSS classes for the outer element — the place for sizing,
     * e.g. `min-h-0 flex-1` inside a flex-column dialog body, or
     * `max-h-[70svh]` on its own. Not `h-full`: a dialog panel's height is
     * auto under a `max-h-*` cap, which is not definite, so a percentage
     * height collapses, the scroller grows to its content and never scrolls —
     * and its `overscroll-contain` then swallows the wheel over the content
     * instead of passing it up. Flex sizing shrinks without needing a
     * definite height.
     */
    className?: string;
    /** The scrolling content */
    children?: React.ReactNode;
};

/**
 * A scroll container that fades its bottom edge while more content is below.
 *
 * The fade is the affordance a cut-off row used to be: it says "this list
 * continues" without a scrollbar having to. It appears only while there is
 * something left to scroll to — at the end of the list, and on content short
 * enough not to scroll at all, the fade is gone and the last row reads whole.
 *
 * The gradient matches {@link Dialog}'s panel surface (white / zinc-900),
 * which is where scrolling bodies live.
 */
export function ScrollFade(props: ScrollFadeProps) {
    const { className, children } = props;
    const scroller = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const [more, setMore] = useState(false);

    const update = useCallback(() => {
        const element = scroller.current;
        if (element !== null) {
            setMore(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
        }
    }, []);

    useEffect(() => {
        update();
        // The container resizing and the content growing both move the edge —
        // results loading into a search change scrollHeight without a scroll.
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(update);
        if (scroller.current !== null) observer.observe(scroller.current);
        if (content.current !== null) observer.observe(content.current);
        return () => observer.disconnect();
    }, [update]);

    return (
        <div className={clsx(className, "relative flex min-h-0 flex-col")}>
            <div ref={scroller} onScroll={update} className={"min-h-0 flex-1 overflow-y-auto overscroll-contain"}>
                <div ref={content}>{children}</div>
            </div>
            <div
                aria-hidden={true}
                className={clsx(
                    // z-10 so content that floats its own controls (a flip
                    // button on a card) still fades out under the edge.
                    "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-linear-to-t from-white to-transparent transition-opacity duration-200 dark:from-zinc-900",
                    more ? "opacity-100" : "opacity-0",
                )}
            />
        </div>
    );
}
