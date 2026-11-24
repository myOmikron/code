import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { motion, useMotionValue, useTransform } from "motion/react";
import type { Variants } from "motion/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DatingCardResponse } from "src/api/generated";
import { CardFlipButton } from "src/components/card-flip-button";
import { ManaCost } from "src/components/mana-cost";
import { formatCurrency } from "src/utils/format";
import { SWIPE_DISTANCE, manaSymbols, swipeDirection } from "src/utils/dating";
import type { SwipeDirection } from "src/utils/dating";

/** Where a card flies when it leaves, per direction */
const EXIT: Record<SwipeDirection, { x: number | string; y: number | string; rotate: number }> = {
    left: { x: "-120%", y: 40, rotate: -24 },
    right: { x: "120%", y: 40, rotate: 24 },
    up: { x: 0, y: "-120%", rotate: 0 },
};

/** The exit, picked by the direction `AnimatePresence` passes as `custom` */
const LEAVE: Variants = {
    leave: (direction: SwipeDirection | null) => ({
        ...(direction ? EXIT[direction] : { scale: 0.9 }),
        opacity: 0,
        transition: { duration: 0.28, ease: "easeIn" },
    }),
};

/** One side of the card; on desktop the art half of it */
const FACE =
    "absolute inset-0 block overflow-hidden rounded-(--radius-card) bg-zinc-800 text-left text-white shadow-(--shadow-card-lg) ring-1 ring-zinc-950/10 backface-hidden lg:rounded-r-none lg:shadow-none dark:ring-white/10";

/** A fact tile of the desktop profile */
const TILE = "rounded-(--radius-control) bg-white/6 px-3 py-2.5";

/**
 * The properties for {@link DatingCard}
 */
export type DatingCardProps = {
    /** The Commander */
    card: DatingCardResponse;
    /** What the Commander is looking for, if it has a line for that */
    tagline?: string | null;
    /** Whether it is the top card, the only one that can be dragged */
    top: boolean;
    /** Whether the card is turned to its rules text */
    flipped: boolean;
    /** A finished swipe */
    onSwipe: (direction: SwipeDirection) => void;
    /** A tap without a drag */
    onFlip: () => void;
    /** The info button */
    onOpenBio: () => void;
};

/**
 * One Commander of the swipe stack: full-bleed art, its name, colors and interests.
 * A tap turns it over to the card itself. On desktop its profile sits beside the art.
 *
 * @returns the card
 */
export function DatingCard({ card, tagline, top, flipped, onSwipe, onFlip, onOpenBio }: DatingCardProps) {
    const [t] = useTranslation("dating");
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotate = useTransform(x, [-240, 240], [-14, 14]);
    const like = useTransform(x, [20, SWIPE_DISTANCE], [0, 1]);
    const pass = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0]);
    const superLike = useTransform(y, [-SWIPE_DISTANCE, -20], [1, 0]);
    const dragged = useRef(false);
    const art = card.image_art_crop ?? card.image_normal ?? null;
    const turned = top && flipped;
    const [back, setBack] = useState(false);
    const face = back && card.image_back_normal ? card.image_back_normal : card.image_normal;

    /**
     * Runs a tap unless it ended a drag
     *
     * @param action what the tap does
     * @returns the click handler
     */
    const tap = (action: () => void) => () => {
        if (!dragged.current) action();
    };

    return (
        <motion.div
            className={
                "absolute inset-0 touch-none select-none perspective-distant lg:flex lg:rounded-(--radius-card) lg:shadow-(--shadow-card-lg)"
            }
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
            <motion.div
                className={"relative size-full transform-3d lg:min-w-0 lg:flex-1"}
                initial={false}
                animate={{ rotateY: turned ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
                <button type={"button"} disabled={!top} inert={turned} onClick={tap(onFlip)} className={FACE}>
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
                                    "absolute inset-x-0 top-0 aspect-[626/457] w-full mask-b-from-70% mask-b-to-100% object-cover lg:inset-0 lg:aspect-auto lg:size-full lg:mask-none"
                                }
                            />
                        </>
                    )}
                    {card.your_type && (
                        <span
                            className={
                                "absolute top-3 right-3 rounded-full bg-lime-400 px-2.5 py-1 text-xs font-bold text-lime-950 lg:top-4 lg:right-auto lg:left-4"
                            }
                        >
                            {t("label.your-type")}
                        </span>
                    )}
                    <span
                        className={
                            "absolute inset-x-0 bottom-0 flex flex-col gap-2.5 bg-linear-to-t from-zinc-950/95 from-40% to-transparent px-4 pt-20 pb-4 lg:px-7 lg:pt-24 lg:pb-6"
                        }
                    >
                        {card.color_identity !== "" && (
                            <ManaCost value={manaSymbols(card.color_identity)} symbolClassName={"size-5"} />
                        )}
                        <span className={"text-2xl leading-tight font-extrabold tracking-tight lg:text-4xl"}>
                            {card.name}
                        </span>
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
                        <span className={"text-xs text-zinc-300 lg:hidden"}>{t("label.tap-to-read")}</span>
                    </span>
                </button>

                <button
                    type={"button"}
                    disabled={!top}
                    inert={!turned}
                    onClick={tap(onFlip)}
                    className={`${FACE} rotate-y-180`}
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
                    {face ? (
                        <span className={"absolute inset-3 flex items-center justify-center"}>
                            <img
                                src={face}
                                alt={`${card.name}. ${card.oracle_text}`}
                                draggable={false}
                                crossOrigin={"anonymous"}
                                className={"max-h-full max-w-full rounded-[4.75%/3.5%] shadow-(--shadow-card-lg)"}
                            />
                        </span>
                    ) : (
                        <span className={"absolute inset-0 flex flex-col justify-center gap-2 p-5"}>
                            <span className={"text-xl font-extrabold"}>{card.name}</span>
                            <span className={"text-xs text-zinc-300 dark:text-zinc-300"}>{card.type_line}</span>
                            <span className={"text-sm/6 whitespace-pre-line"}>{card.oracle_text}</span>
                        </span>
                    )}
                </button>
            </motion.div>

            {turned && card.image_back_normal && (
                <div className={"absolute right-3 bottom-3 z-10 lg:hidden"}>
                    <CardFlipButton flipped={back} onFlip={() => setBack((shown) => !shown)} position={"inline"} />
                </div>
            )}

            <DatingCardProfile
                card={card}
                tagline={tagline ?? null}
                face={face ?? null}
                back={back}
                onFlipFace={card.image_back_normal ? () => setBack((shown) => !shown) : null}
            />

            {top && (
                <button
                    type={"button"}
                    onClick={tap(onOpenBio)}
                    aria-label={t("accessibility.open-bio")}
                    className={
                        "absolute top-3 left-3 z-10 flex size-10 items-center justify-center rounded-full bg-zinc-950/50 text-white ring-1 ring-white/20 backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500 lg:hidden dark:bg-zinc-950/50 dark:text-white dark:ring-white/20"
                    }
                >
                    <InformationCircleIcon className={"size-5"} />
                </button>
            )}

            <motion.span
                aria-hidden={true}
                style={{ opacity: like }}
                className={
                    "pointer-events-none absolute top-16 left-5 z-10 -rotate-12 rounded-lg border-4 border-lime-400 bg-zinc-950/40 px-3 py-1 text-3xl font-extrabold text-lime-400 dark:bg-zinc-950/40"
                }
            >
                {t("label.like-stamp")}
            </motion.span>
            <motion.span
                aria-hidden={true}
                style={{ opacity: pass }}
                className={
                    "pointer-events-none absolute top-16 right-5 z-10 rotate-12 rounded-lg border-4 border-zinc-200 bg-zinc-950/40 px-3 py-1 text-3xl font-extrabold text-zinc-200 dark:bg-zinc-950/40"
                }
            >
                {t("label.pass-stamp")}
            </motion.span>
            <motion.span
                aria-hidden={true}
                style={{ opacity: superLike }}
                className={
                    "pointer-events-none absolute bottom-44 left-1/2 z-10 -translate-x-1/2 rounded-lg border-4 border-sky-400 bg-zinc-950/40 px-3 py-1 text-3xl font-extrabold text-sky-400 dark:bg-zinc-950/40"
                }
            >
                {t("label.super-stamp")}
            </motion.span>
        </motion.div>
    );
}

/**
 * The desktop profile beside the art: the card itself, what it is looking for, its rank and price.
 *
 * @param props the Commander and the face shown
 * @param props.card the Commander
 * @param props.tagline what it is looking for
 * @param props.face the card image to show
 * @param props.back whether the back face is shown
 * @param props.onFlipFace turn to the other face, `null` for one-faced cards
 * @returns the panel, hidden on phones
 */
function DatingCardProfile(props: {
    card: DatingCardResponse;
    tagline: string | null;
    face: string | null;
    back: boolean;
    onFlipFace: (() => void) | null;
}) {
    const { card, tagline, face, back, onFlipFace } = props;
    const [t] = useTranslation("dating");

    return (
        <div
            className={
                "hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-r-(--radius-card) bg-zinc-900 p-6 text-white ring-1 ring-zinc-950/10 lg:flex xl:w-90 dark:ring-white/10"
            }
        >
            {face ? (
                <span className={"relative min-h-48 flex-1"}>
                    <img
                        src={face}
                        alt={`${card.name}. ${card.oracle_text}`}
                        draggable={false}
                        crossOrigin={"anonymous"}
                        className={"absolute inset-x-0 top-0 mx-auto max-h-full max-w-full rounded-[4.75%/3.5%]"}
                    />
                    {onFlipFace && (
                        <span className={"absolute right-2 bottom-2"}>
                            <CardFlipButton flipped={back} onFlip={onFlipFace} position={"inline"} />
                        </span>
                    )}
                </span>
            ) : (
                <div className={"flex flex-col gap-2"}>
                    <span className={"text-xs text-zinc-400"}>{card.type_line}</span>
                    <p className={"text-sm/6 whitespace-pre-line"}>{card.oracle_text}</p>
                </div>
            )}
            {tagline && <p className={"text-base/6 font-semibold"}>{t("description.looking-for", { tagline })}</p>}
            <dl className={"grid shrink-0 grid-cols-2 gap-2"}>
                <div className={TILE}>
                    <dt className={"text-xs text-zinc-400"}>{t("label.edhrec-rank")}</dt>
                    <dd className={"font-bold"}>{card.edhrec_rank != null ? `#${card.edhrec_rank}` : "–"}</dd>
                </div>
                <div className={TILE}>
                    <dt className={"text-xs text-zinc-400"}>{t("label.commander-price")}</dt>
                    <dd className={"font-bold"}>{card.price_eur != null ? formatCurrency(card.price_eur) : "–"}</dd>
                </div>
            </dl>
        </div>
    );
}
