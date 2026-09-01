import { useEffect, useLayoutEffect, useRef } from "react";

/** The attribute a card element names itself in */
const ATTRIBUTE = "data-pointer-card";

/**
 * Marks an element as a card the pointer can rest on.
 *
 * Spread onto whatever element the hover already sits on, so that
 * {@link usePointerCard} finds the same card the mouse events report.
 *
 * @param key what the card is called, usually its uuid
 *
 * @returns the attribute to spread onto the element
 */
export function pointerCard(key: string): Record<string, string> {
    return { [ATTRIBUTE]: key };
}

/**
 * The card an event happened over, `null` when it happened beside one.
 *
 * For a list that would rather delegate one `pointerover` on its container
 * than hand every row a pair of handlers of its own — the answer is read off
 * the same attribute {@link pointerCard} writes, so both ways of asking agree.
 *
 * @param target what the event reports it happened on
 *
 * @returns the card's key, or `null`
 */
export function pointerCardOf(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest(`[${ATTRIBUTE}]`)?.getAttribute(ATTRIBUTE) ?? null;
}

/**
 * Keeps the card under the pointer current when the list moves beneath it.
 *
 * `mouseenter` is the browser answering a question about the pointer, and the
 * pointer is not what moved: tagging a card files it into another group, the
 * next card slides into its place, and no event fires for it. Whatever the
 * keys act on would still be the card that left — the one card the pointer is
 * demonstrably no longer on.
 *
 * So the pointer's last position is kept, and after every render what is
 * actually under it is read back. Every render, not only when the list is
 * reordered: a tag badge appearing makes its row taller and pushes everything
 * below it down without changing the order at all. Before paint, so the
 * preview beside the list never shows the card that left.
 *
 * Keyboard focus wins where it exists. Someone tabbing through the list is not
 * pointing at anything, and where the mouse happens to rest must not overrule
 * them.
 *
 * @param onCard told which card is under the pointer, `null` when none is
 */
export function usePointerCard(onCard: (key: string | null) => void): void {
    const at = useRef<{ x: number; y: number } | null>(null);
    const report = useRef(onCard);
    report.current = onCard;
    /** The frame the next read is scheduled in, so a burst costs one */
    const frame = useRef<number | null>(null);

    useEffect(() => {
        /**
         * Remembers where the pointer is
         *
         * @param event the move that got it there
         */
        function track(event: PointerEvent) {
            at.current = { x: event.clientX, y: event.clientY };
        }

        /** Forgets the pointer once it is off the window entirely */
        function forget() {
            at.current = null;
        }

        window.addEventListener("pointermove", track, { passive: true });
        window.addEventListener("pointerdown", track, { passive: true });
        document.addEventListener("pointerleave", forget);
        return () => {
            window.removeEventListener("pointermove", track);
            window.removeEventListener("pointerdown", track);
            document.removeEventListener("pointerleave", forget);
        };
    }, []);

    // Read after paint, once per frame, instead of before it on every render.
    //
    // `elementFromPoint` needs a laid-out page, so asking for it from a layout
    // effect — after a render, before paint — made the browser compute layout
    // there and then. On a list of sixty cards that is a forced reflow per
    // render, and the renders come in bursts: opening a dialog moves the page
    // under the pointer, the answer changes, the report re-renders the list,
    // and the next reflow is already queued. A profile of the deck page spent
    // four of five seconds in scripting with "forced reflow" on top.
    //
    // A frame is scheduled instead and a second one during the same frame is
    // dropped, so a burst of renders costs one read. By then the browser has
    // laid the page out for its own paint and the answer is free.
    //
    // The cost is that the correction lands one frame late rather than before
    // paint. Sixteen milliseconds of the preview showing the card that just
    // left is not something a reader can see; the stalls were.
    useLayoutEffect(() => {
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = null;

            const point = at.current;
            // No pointer has ever moved here: a touch screen, or a page driven
            // by the keyboard alone. Nothing to correct.
            if (point === null) return;
            if (document.activeElement?.closest(`[${ATTRIBUTE}]`) != null) return;

            const under = document.elementFromPoint(point.x, point.y);
            report.current(under?.closest(`[${ATTRIBUTE}]`)?.getAttribute(ATTRIBUTE) ?? null);
        });
    });

    useEffect(
        () => () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
        },
        [],
    );
}
