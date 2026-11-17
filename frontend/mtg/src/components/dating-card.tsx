import { motion, useMotionValue, useTransform } from "motion/react";
import type { Variants } from "motion/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { DatingCardResponse } from "src/api/generated";
import { ManaCost } from "src/components/mana-cost";
import { SWIPE_DISTANCE, manaSymbols, swipeDirection } from "src/utils/dating";
import type { SwipeDirection } from "src/utils/dating";

/** Where a card flies when it leaves, per direction */
const EXIT: Record<SwipeDirection, { x: number; y: number; rotate: number }> = {
    left: { x: -640, y: 40, rotate: -24 },
    right: { x: 640, y: 40, rotate: 24 },
    up: { x: 0, y: -900, rotate: 0 },
};

/** The exit, picked by the direction `AnimatePresence` passes as `custom` */
const LEAVE: Variants = {
    leave: (direction: SwipeDirection | null) => ({
        ...(direction ? EXIT[direction] : { scale: 0.9 }),
        opacity: 0,
        transition: { duration: 0.28, ease: "easeIn" },
    }),
};

/**
 * The properties for {@link DatingCard}
 */
export type DatingCardProps = {
    /** The Commander */
    card: DatingCardResponse;
    /** Whether it is the top card, the only one that can be dragged */
    top: boolean;
    /** A finished swipe */
    onSwipe: (direction: SwipeDirection) => void;
    /** A tap without a drag */
    onOpenBio: () => void;
};

/**
 * One Commander of the swipe stack: full-bleed art, its name, colors and interests.
 *
 * @returns the card
 */
export function DatingCard({ card, top, onSwipe, onOpenBio }: DatingCardProps) {
    const [t] = useTranslation("dating");
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotate = useTransform(x, [-240, 240], [-14, 14]);
    const like = useTransform(x, [20, SWIPE_DISTANCE], [0, 1]);
    const pass = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0]);
    const superLike = useTransform(y, [-SWIPE_DISTANCE, -20], [1, 0]);
    const dragged = useRef(false);
    const art = card.image_art_crop ?? card.image_normal ?? null;

    return (
        <motion.div
            className={"absolute inset-0 touch-none select-none"}
            style={{ x, y, rotate, zIndex: top ? 2 : 1 }}
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={top ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.94, opacity: 0.6, y: 14 }}
            variants={LEAVE}
            exit={"leave"}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            drag={top}
            dragSnapToOrigin={true}
            dragElastic={0.9}
            onDragStart={() => {
                dragged.current = true;
            }}
            onDragEnd={(_event, info) => {
                window.setTimeout(() => {
                    dragged.current = false;
                }, 0);
                const direction = swipeDirection(info.offset, info.velocity);
                if (direction !== null) onSwipe(direction);
            }}
        >
            <button
                type={"button"}
                disabled={!top}
                onClick={() => {
                    if (!dragged.current) onOpenBio();
                }}
                className={
                    "relative block size-full overflow-hidden rounded-(--radius-card) bg-zinc-800 text-left text-white shadow-(--shadow-card-lg) ring-1 ring-zinc-950/10 dark:ring-white/10"
                }
            >
                {art !== null && (
                    <>
                        <img
                            src={art}
                            alt={""}
                            aria-hidden={true}
                            draggable={false}
                            crossOrigin={"anonymous"}
                            className={"absolute inset-0 size-full scale-125 object-cover blur-2xl brightness-50"}
                        />
                        <img
                            src={art}
                            alt={t("accessibility.art", { name: card.name })}
                            draggable={false}
                            crossOrigin={"anonymous"}
                            className={
                                "absolute inset-x-0 top-0 aspect-[626/457] w-full mask-b-from-70% mask-b-to-100% object-cover"
                            }
                        />
                    </>
                )}
                {card.your_type && (
                    <span
                        className={
                            "absolute top-3 right-3 rounded-full bg-lime-400 px-2.5 py-1 text-xs font-bold text-lime-950"
                        }
                    >
                        {t("label.your-type")}
                    </span>
                )}

                <motion.span
                    aria-hidden={true}
                    style={{ opacity: like }}
                    className={
                        "absolute top-12 left-5 -rotate-12 rounded-lg border-4 border-lime-400 px-3 py-1 text-3xl font-extrabold text-lime-400"
                    }
                >
                    {t("label.like-stamp")}
                </motion.span>
                <motion.span
                    aria-hidden={true}
                    style={{ opacity: pass }}
                    className={
                        "absolute top-12 right-5 rotate-12 rounded-lg border-4 border-zinc-200 px-3 py-1 text-3xl font-extrabold text-zinc-200"
                    }
                >
                    {t("label.pass-stamp")}
                </motion.span>
                <motion.span
                    aria-hidden={true}
                    style={{ opacity: superLike }}
                    className={
                        "absolute bottom-44 left-1/2 -translate-x-1/2 rounded-lg border-4 border-sky-400 px-3 py-1 text-3xl font-extrabold text-sky-400"
                    }
                >
                    {t("label.super-stamp")}
                </motion.span>

                <span
                    className={
                        "absolute inset-x-0 bottom-0 flex flex-col gap-2.5 bg-linear-to-t from-zinc-950/95 from-40% to-transparent px-4 pt-20 pb-4"
                    }
                >
                    {card.color_identity !== "" && (
                        <ManaCost value={manaSymbols(card.color_identity)} symbolClassName={"size-5"} />
                    )}
                    <span className={"text-2xl leading-tight font-extrabold tracking-tight"}>{card.name}</span>
                    <span className={"flex flex-wrap gap-1.5"}>
                        {card.interests.map((interest) => (
                            <span
                                key={interest.label}
                                className={
                                    "rounded-full bg-lime-400/15 px-2.5 py-1 text-xs font-semibold text-lime-100 ring-1 ring-lime-400/40"
                                }
                            >
                                {interest.label}
                            </span>
                        ))}
                    </span>
                    <span className={"text-xs text-zinc-300"}>{t("label.tap-for-bio")}</span>
                </span>
            </button>
        </motion.div>
    );
}
