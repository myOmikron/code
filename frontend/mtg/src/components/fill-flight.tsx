import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** How long one chip's own flight takes */
const DURATION = 0.55;

/** How far behind the previous chip each next one starts, so the flight reads as a burst rather than one block */
const STAGGER = 0.06;

/** The chip's width — matches the `w-10` class below, in px, for the position maths */
const CHIP_WIDTH = 40;

/** The chip's height, from its `aspect-[5/7]` */
const CHIP_HEIGHT = (CHIP_WIDTH * 7) / 5;

/**
 * One card riding the flight, and where it starts from
 */
export type FillFlightCard = {
    /** Stable key, the card's oracle id */
    key: string;
    /** Small artwork, null when Scryfall has none */
    imageUrl: string | null;
    /** Where the dialog row was on screen */
    from: DOMRect;
};

/**
 * The properties for {@link FillFlight}
 */
export type FillFlightProps = {
    /** The cards in flight, or null when nothing is flying */
    cards: Array<FillFlightCard> | null;
    /** Where the deck pile is on screen */
    to: DOMRect | null;
    /** Called once after the last card has landed */
    onDone: () => void;
};

/**
 * Small card chips flying from a fill dialog's rows to the deck pile.
 *
 * Purely decorative — `aria-hidden`, no i18n strings — and degrades to no
 * animation whenever a precondition is missing: no cards, no landing spot, or
 * the reader asked the OS for reduced motion. Either way `onDone` still fires,
 * exactly once, so the caller's landing logic (toast, refresh) never depends
 * on the gimmick actually playing.
 *
 * @returns the flying chips, portaled onto `document.body`, or nothing
 */
export function FillFlight({ cards, to, onDone }: FillFlightProps) {
    const prefersReducedMotion = useReducedMotion();
    const landed = useRef(0);
    const done = useRef(false);

    /** Calls `onDone`, but never more than once per flight */
    const finish = useCallback(() => {
        if (done.current) return;
        done.current = true;
        onDone();
    }, [onDone]);

    useEffect(() => {
        if (cards === null || to === null) return;
        done.current = false;
        landed.current = 0;

        // Nothing to animate, or the reader does not want to see it: skip
        // straight to the landing logic.
        if (prefersReducedMotion === true || cards.length === 0) {
            finish();
            return;
        }

        // Safety net: `onAnimationComplete` should call `finish` once every
        // chip has landed, but a chip that never fires (an interrupted
        // animation, a browser quirk) must not strand the caller waiting
        // forever for its toast and deck refresh.
        const totalMs = ((cards.length - 1) * STAGGER + DURATION + 0.5) * 1000;
        const timer = window.setTimeout(finish, totalMs);
        return () => window.clearTimeout(timer);
    }, [cards, to, prefersReducedMotion, finish]);

    if (cards === null || to === null || cards.length === 0 || prefersReducedMotion === true) return null;

    return createPortal(
        <div aria-hidden className={"pointer-events-none fixed inset-0 z-50"}>
            {cards.map((card, index) => {
                const fromLeft = card.from.x + card.from.width / 2 - CHIP_WIDTH / 2;
                const fromTop = card.from.y;
                const toLeft = to.x + to.width / 2 - CHIP_WIDTH / 2;
                const toTop = to.y + to.height / 2 - CHIP_HEIGHT / 2;

                return (
                    <motion.div
                        key={card.key}
                        style={{
                            position: "fixed",
                            backgroundImage: card.imageUrl !== null ? `url(${card.imageUrl})` : undefined,
                        }}
                        initial={{ left: fromLeft, top: fromTop, scale: 1, opacity: 1 }}
                        animate={{ left: toLeft, top: toTop, scale: 0.25, opacity: 0 }}
                        transition={{ duration: DURATION, ease: "easeInOut", delay: index * STAGGER }}
                        onAnimationComplete={() => {
                            landed.current += 1;
                            if (landed.current >= cards.length) finish();
                        }}
                        className={clsx(
                            "aspect-[5/7] w-10 rounded-md border border-zinc-950/20 bg-cover bg-center shadow-lg",
                            card.imageUrl === null &&
                                "bg-gradient-to-br from-zinc-300 to-zinc-500 dark:from-zinc-600 dark:to-zinc-800",
                        )}
                    />
                );
            })}
        </div>,
        document.body,
    );
}
