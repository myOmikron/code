import { motion, useMotionValue, useTransform } from "motion/react";
import type { Variants } from "motion/react";
import { useTranslation } from "react-i18next";
import { ThemeLevel } from "src/api/generated";
import { SWIPE_DISTANCE, swipeDirection } from "src/utils/dating";
import type { SwipeDirection } from "src/utils/dating";
import { levelKey } from "src/utils/dating-date";

/** Where a proposal flies when it leaves, per direction */
const EXIT: Record<SwipeDirection, { x: number | string; y: number | string; rotate: number }> = {
    left: { x: "-130%", y: 20, rotate: -16 },
    right: { x: "130%", y: 20, rotate: 16 },
    up: { x: 0, y: "-220%", rotate: 0 },
};

/** The exit, picked by the direction `AnimatePresence` passes as `custom` */
const LEAVE: Variants = {
    leave: (direction: SwipeDirection | null) => ({
        ...(direction ? EXIT[direction] : { scale: 0.9 }),
        opacity: 0,
        transition: { duration: 0.26, ease: "easeIn" },
    }),
};

/** A level stamped on the card while it is dragged */
const STAMP =
    "pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 rounded-lg border-4 px-2.5 py-0.5 text-xl font-extrabold uppercase";

/**
 * The properties for {@link DatingProposalCard}
 */
export type DatingProposalCardProps = {
    /** The proposed theme's label */
    label: string;
    /** The Commander's art for the backdrop */
    art: string | null;
    /** A finished swipe */
    onSwipe: (direction: SwipeDirection) => void;
};

/**
 * The Commander's proposal as a card to swipe: right for core, up for all in, left for not my thing.
 *
 * @returns the card, filling its parent
 */
export function DatingProposalCard({ label, art, onSwipe }: DatingProposalCardProps) {
    const [t] = useTranslation("dating");
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotate = useTransform(x, [-240, 240], [-10, 10]);
    const core = useTransform(x, [20, SWIPE_DISTANCE], [0, 1]);
    const avoid = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0]);
    const allin = useTransform(y, [-SWIPE_DISTANCE, -20], [1, 0]);

    return (
        <motion.div
            className={"absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"}
            style={{ x, y, rotate }}
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            variants={LEAVE}
            exit={"leave"}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            drag={true}
            dragSnapToOrigin={true}
            dragElastic={0.9}
            onDragEnd={(_event, info) => {
                const direction = swipeDirection(info.offset, info.velocity);
                if (direction !== null) onSwipe(direction);
            }}
        >
            <div
                className={
                    "relative flex size-full flex-col justify-center gap-1 overflow-hidden rounded-(--radius-card) bg-zinc-900 px-5 shadow-(--shadow-card-lg) ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10"
                }
            >
                {art !== null && (
                    <img
                        src={art}
                        alt={""}
                        aria-hidden={true}
                        draggable={false}
                        crossOrigin={"anonymous"}
                        className={"absolute inset-0 size-full scale-125 object-cover blur-2xl brightness-50"}
                    />
                )}
                <span className={"relative text-xs font-semibold text-lime-300 dark:text-lime-300"}>
                    {t("label.proposal")}
                </span>
                <span
                    className={
                        "relative line-clamp-2 text-2xl leading-tight font-extrabold tracking-tight text-white dark:text-white"
                    }
                >
                    {label}
                </span>
            </div>

            <motion.span
                aria-hidden={true}
                style={{ opacity: core }}
                className={`${STAMP} left-4 -rotate-12 border-lime-400 bg-zinc-950/40 text-lime-400 dark:bg-zinc-950/40`}
            >
                {t(levelKey(ThemeLevel.core))}
            </motion.span>
            <motion.span
                aria-hidden={true}
                style={{ opacity: avoid }}
                className={`${STAMP} right-4 rotate-12 border-red-400 bg-zinc-950/40 text-red-400 dark:bg-zinc-950/40`}
            >
                {t(levelKey(ThemeLevel.avoid))}
            </motion.span>
            <motion.span
                aria-hidden={true}
                style={{ opacity: allin }}
                className={`${STAMP} left-1/2 -translate-x-1/2 border-lime-400 bg-lime-400 text-lime-950 dark:bg-lime-400`}
            >
                {t(levelKey(ThemeLevel.allin))}
            </motion.span>
        </motion.div>
    );
}
