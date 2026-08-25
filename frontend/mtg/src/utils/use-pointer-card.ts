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

    useLayoutEffect(() => {
        const point = at.current;
        // No pointer has ever moved here: a touch screen, or a page driven by
        // the keyboard alone. Nothing to correct.
        if (point === null) return;
        if (document.activeElement?.closest(`[${ATTRIBUTE}]`) != null) return;

        const under = document.elementFromPoint(point.x, point.y);
        report.current(under?.closest(`[${ATTRIBUTE}]`)?.getAttribute(ATTRIBUTE) ?? null);
    });
}
