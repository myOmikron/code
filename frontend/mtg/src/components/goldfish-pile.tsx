import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import type { MenuAt } from "src/components/context-menu";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import { FoilFrame } from "src/components/foil-frame";
import type { GoldfishCard, GoldfishZone } from "src/utils/goldfish";

/**
 * The properties for {@link GoldfishPile}
 */
export type GoldfishPileProps = {
    /** Which zone the pile is */
    zone: GoldfishZone;
    /** What the pile is called */
    label: string;
    /** What lies on it, top first */
    cards: Array<GoldfishCard>;
    /** Whether the top card is shown face down */
    faceDown?: boolean;
    /** Whether a dragged card is hovering over the pile */
    over?: boolean;
    /** Counts up every time the pile is shuffled, so it can be seen shaking */
    shakes?: number;
    /** What a tap does, said as a tooltip */
    hint: string;
    /** What a tap does */
    onClick: () => void;
    /** Opens the pile's menu at a point, for piles that have one */
    onOpenMenu?: (at: MenuAt) => void;
    /** Classes for the frame, which is where a table sets the width */
    className?: string;
    /** Whether the name is drawn tiny, for a table with little room */
    compact?: boolean;
};

/**
 * A stack of cards seen from above: the top card and how many lie under it.
 *
 * The top card keeps its identity, so a card sent to the graveyard flies onto
 * it and a card drawn from the library flies off it.
 *
 * @returns the pile
 */
export function GoldfishPile({
    zone,
    label,
    cards,
    faceDown = false,
    over = false,
    shakes = 0,
    hint,
    onClick,
    onOpenMenu,
    className = "w-20 sm:w-24",
    compact = false,
}: GoldfishPileProps) {
    const top = cards[0] ?? null;
    const image = top === null || faceDown ? null : top.flipped ? top.backImage : top.image;

    return (
        <button
            type={"button"}
            title={hint}
            onClick={onClick}
            data-drop-zone={zone}
            {...(onOpenMenu === undefined ? {} : contextMenuTrigger(onOpenMenu))}
            className={clsx(
                onOpenMenu !== undefined && CONTEXT_MENU_TARGET,
                className,
                "flex shrink-0 flex-col items-center gap-1 rounded-lg p-1 transition outline-none",
                "hover:bg-zinc-950/5 focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-white/10",
                over && "scale-105 bg-blue-500/10 ring-2 ring-blue-400",
            )}
        >
            <motion.div
                key={shakes}
                initial={shakes === 0 ? false : { rotate: -10, scale: 0.92 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 10 }}
                className={clsx(
                    "relative aspect-5/7 w-full rounded-[4.5%/3.2%]",
                    top === null && "border border-dashed border-zinc-400 dark:border-zinc-600",
                )}
            >
                {cards.length > 1 && (
                    <>
                        <div
                            className={
                                "absolute inset-0 translate-x-1 translate-y-1 rounded-[4.5%/3.2%] bg-zinc-700 ring-1 ring-black/30"
                            }
                        />
                        <div
                            className={
                                "absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-[4.5%/3.2%] bg-zinc-600 ring-1 ring-black/30"
                            }
                        />
                    </>
                )}
                <AnimatePresence initial={false}>
                    {top !== null && (
                        <motion.div
                            key={top.id}
                            layoutId={top.id}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            className={"absolute inset-0"}
                        >
                            {faceDown ? (
                                <div
                                    className={
                                        "size-full rounded-[4.5%/3.2%] bg-[radial-gradient(circle_at_50%_40%,#8b5a2b,#3b2314_70%)] ring-1 ring-black/30"
                                    }
                                />
                            ) : (
                                <FoilFrame
                                    finish={top.finish}
                                    compact={true}
                                    image={image}
                                    className={"size-full rounded-[4.5%/3.2%] bg-zinc-800 ring-1 ring-black/30"}
                                >
                                    {image !== null && (
                                        <img src={image} alt={top.name} className={"size-full object-cover"} />
                                    )}
                                </FoilFrame>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
                {top !== null && (
                    <span
                        className={
                            "absolute right-1 bottom-1 z-10 rounded-full bg-zinc-950/80 px-1.5 text-[11px]/4 font-semibold text-white tabular-nums"
                        }
                    >
                        <motion.span
                            key={cards.length}
                            initial={{ scale: 1.5 }}
                            animate={{ scale: 1 }}
                            className={"inline-block"}
                        >
                            {cards.length}
                        </motion.span>
                    </span>
                )}
            </motion.div>
            <span
                className={clsx(
                    "truncate text-zinc-600 dark:text-zinc-400",
                    compact ? "text-[9px]/3" : "text-[11px]/4",
                )}
            >
                {label}
            </span>
        </button>
    );
}
