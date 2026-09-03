import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { GoldfishCard } from "src/utils/goldfish";

/** How long the stage holds the card before it takes its place on the table */
export const CAST_DURATION = 1900;

/**
 * How long the card is its own thing before it takes on the table's identity.
 *
 * Arriving through a shared layout animation would scale the small card up
 * and show it blurred: the browser rasterises it at the size it started at.
 * So the card enters at full size on its own, and only once it stands still
 * does it take the id the table knows it by, for the flight to its place.
 */
const SETTLE_DELAY = 500;

/** Where the sparks fly, as angles around the card */
const SPARKS = Array.from({ length: 10 }, (_, index) => (index / 10) * Math.PI * 2);

/**
 * The properties for {@link GoldfishCastStage}
 */
export type GoldfishCastStageProps = {
    /** The card being cast */
    card: GoldfishCard;
};

/**
 * The commander's entrance.
 *
 * A commander is not played, it arrives. The card flies out of the command
 * zone to the middle of the table, grows, and for a moment the table is
 * about nothing else: light rolls out from under it, sparks leave it, its
 * name is called. Then it takes its place among the permanents.
 *
 * @returns the stage
 */
export function GoldfishCastStage({ card }: GoldfishCastStageProps) {
    const [t] = useTranslation("goldfish");
    const [settled, setSettled] = useState(false);
    const image = card.flipped ? card.backImage : card.image;

    useEffect(() => {
        const timer = window.setTimeout(() => setSettled(true), SETTLE_DELAY);
        return () => window.clearTimeout(timer);
    }, []);

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            className={
                "pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-3xl"
            }
        >
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={"absolute inset-0 bg-zinc-950/70"}
            />
            {[0, 0.18, 0.36].map((delay) => (
                <motion.div
                    key={delay}
                    initial={{ scale: 0.2, opacity: 0.9 }}
                    animate={{ scale: 6, opacity: 0 }}
                    transition={{ duration: 1.5, delay: 0.15 + delay, ease: "easeOut" }}
                    className={"absolute size-48 rounded-full border-2 border-amber-300/70"}
                />
            ))}
            <motion.div
                initial={{ rotate: 0, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 360, scale: 1.4, opacity: [0, 0.9, 0.9, 0.6] }}
                transition={{
                    rotate: { duration: 1.6, ease: "linear" },
                    scale: { duration: 0.6 },
                    opacity: { duration: 1.4 },
                }}
                className={
                    "absolute size-[42rem] rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(251,191,36,0.55)_40deg,transparent_80deg,transparent_160deg,rgba(253,224,71,0.45)_200deg,transparent_240deg,transparent_320deg,rgba(251,191,36,0.5)_350deg,transparent_360deg)] [mask-image:radial-gradient(circle,black_10%,transparent_65%)]"
                }
            />
            {SPARKS.map((angle, index) => (
                <motion.span
                    key={index}
                    initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
                    animate={{
                        x: Math.cos(angle) * (240 + (index % 3) * 70),
                        y: Math.sin(angle) * (240 + (index % 3) * 70),
                        scale: [0.4, 1.2, 0],
                        opacity: [0, 1, 0],
                    }}
                    transition={{ duration: 1.2, delay: 0.2 + (index % 4) * 0.08, ease: "easeOut" }}
                    className={"absolute size-2 rounded-full bg-amber-200 shadow-[0_0_12px_4px_rgba(251,191,36,0.7)]"}
                />
            ))}
            <div className={"relative flex flex-col items-center gap-4"}>
                <motion.div
                    layoutId={settled ? card.id : undefined}
                    initial={{ opacity: 0, scale: 0.55, y: 80 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    className={"w-[min(16rem,45svh)]"}
                >
                    <motion.div
                        animate={{ scale: [1, 1.05, 1], rotate: [0, -1.5, 1.5, 0] }}
                        transition={{ duration: 1.4, delay: 0.5, ease: "easeInOut" }}
                    >
                        <div
                            className={
                                "aspect-5/7 w-full overflow-hidden rounded-[4.5%/3.2%] bg-zinc-800 shadow-[0_0_48px_12px_rgba(251,191,36,0.55)] ring-2 ring-amber-300/80"
                            }
                        >
                            {image !== null && <img src={image} alt={card.name} className={"size-full object-cover"} />}
                        </div>
                    </motion.div>
                </motion.div>
                <div className={"flex flex-col items-center gap-1 text-center"}>
                    <motion.span
                        initial={{ opacity: 0, y: 10, letterSpacing: "0.1em" }}
                        animate={{ opacity: 1, y: 0, letterSpacing: "0.35em" }}
                        transition={{ delay: 0.35, duration: 0.6, ease: "easeOut" }}
                        className={"text-[11px]/4 font-semibold text-amber-200/90 uppercase"}
                    >
                        {t("heading.cast")}
                    </motion.span>
                    <motion.span
                        initial={{ opacity: 0, y: 14, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 22 }}
                        className={
                            "text-2xl/8 font-semibold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-3xl/9"
                        }
                    >
                        {card.name}
                    </motion.span>
                </div>
            </div>
        </motion.div>,
        document.body,
    );
}
