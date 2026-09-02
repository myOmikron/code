import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuAt } from "src/components/context-menu";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import { FoilFrame } from "src/components/foil-frame";
import type { GoldfishCard as TableCard } from "src/utils/goldfish";
import { pointerCard } from "src/utils/use-pointer-card";

/** A point on the screen */
export type ScreenPoint = { x: number; y: number };

/**
 * The properties for {@link GoldfishCard}
 */
export type GoldfishCardProps = {
    /** The card */
    card: TableCard;
    /** Classes for the frame, which is where a zone sets the size */
    className?: string;
    /** What a tap does, said as a tooltip */
    hint?: string;
    /** What a tap does */
    onClick: () => void;
    /** Opens the card's menu at a point */
    onOpenMenu: (at: MenuAt) => void;
    /** Told when the pointer comes to rest on the card, and when it leaves */
    onHover?: (hovering: boolean) => void;
    /** Told where the card is being dragged to, `null` once it is let go */
    onDragMove?: (at: ScreenPoint | null) => void;
    /** Told where the card was dropped */
    onDrop?: (card: TableCard, at: ScreenPoint) => void;
};

/** How the card springs from one place to the next */
const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;

/**
 * One card on the table.
 *
 * Tapped cards lie sideways, counters sit on the artwork, tokens carry a mark
 * so a copy is told from the card it copies. The card keeps its identity
 * across zones, so it flies from where it was to where it went, and it can be
 * dragged there by hand.
 *
 * @returns the card
 */
export function GoldfishCard({
    card,
    className,
    hint,
    onClick,
    onOpenMenu,
    onHover,
    onDragMove,
    onDrop,
}: GoldfishCardProps) {
    const [t] = useTranslation("goldfish");
    const [dragging, setDragging] = useState(false);
    const dragged = useRef(false);
    const image = card.flipped ? card.backImage : card.image;
    const counters = Object.entries(card.counters);

    return (
        <motion.button
            type={"button"}
            layout={true}
            layoutId={card.id}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1, rotate: card.tapped ? 90 : 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={SPRING}
            drag={onDrop !== undefined}
            dragSnapToOrigin={true}
            dragMomentum={false}
            dragElastic={0.15}
            whileDrag={{ scale: 1.1, rotate: 0 }}
            whileHover={{ y: -4 }}
            onDragStart={() => {
                dragged.current = true;
                setDragging(true);
            }}
            onDrag={(_event, info) =>
                onDragMove?.({ x: info.point.x - window.scrollX, y: info.point.y - window.scrollY })
            }
            onDragEnd={(_event, info) => {
                setDragging(false);
                onDragMove?.(null);
                onDrop?.(card, { x: info.point.x - window.scrollX, y: info.point.y - window.scrollY });
                window.setTimeout(() => {
                    dragged.current = false;
                }, 0);
            }}
            title={hint === undefined ? card.name : `${card.name} · ${hint}`}
            aria-label={card.name}
            onClick={() => {
                if (dragged.current) return;
                onClick();
            }}
            onMouseEnter={() => onHover?.(true)}
            onMouseLeave={() => onHover?.(false)}
            {...pointerCard(card.id)}
            style={{ pointerEvents: dragging ? "none" : undefined, zIndex: dragging ? 60 : undefined }}
            className={clsx(
                CONTEXT_MENU_TARGET,
                "group relative shrink-0 rounded-[4.5%/3.2%] outline-none",
                onDrop !== undefined && "touch-none",
                "focus-visible:ring-2 focus-visible:ring-blue-500",
                dragging ? "cursor-grabbing drop-shadow-2xl" : "cursor-grab",
                className,
            )}
            {...contextMenuTrigger(onOpenMenu)}
        >
            <FoilFrame
                finish={card.finish}
                compact={true}
                image={image}
                className={clsx(
                    "aspect-5/7 w-full rounded-[4.5%/3.2%] bg-zinc-800 shadow-md ring-1 ring-black/30",
                    card.token && "ring-2 ring-amber-400/80",
                )}
            >
                {image !== null ? (
                    <img src={image} alt={card.name} draggable={false} className={"size-full object-cover"} />
                ) : (
                    <div
                        className={
                            "flex size-full items-center justify-center p-1 text-center text-[10px]/3 text-white"
                        }
                    >
                        {card.name}
                    </div>
                )}
            </FoilFrame>
            {card.token && (
                <span
                    className={
                        "absolute top-1 left-1 rounded-sm bg-amber-400 px-1 text-[9px]/4 font-bold text-amber-950 uppercase"
                    }
                >
                    {t("label.token")}
                </span>
            )}
            <div className={"absolute right-1 bottom-1 left-1 flex flex-wrap justify-end gap-0.5"}>
                <AnimatePresence>
                    {counters.map(([kind, value]) => (
                        <motion.span
                            key={kind}
                            layout={true}
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.4, opacity: 0 }}
                            transition={SPRING}
                            className={clsx(
                                "rounded-full px-1.5 text-[10px]/4 font-semibold shadow-sm ring-1 ring-black/40",
                                kind === "-1/-1" ? "bg-red-500 text-white" : "bg-white text-zinc-950",
                            )}
                        >
                            <motion.span
                                key={value}
                                initial={{ scale: 1.6 }}
                                animate={{ scale: 1 }}
                                transition={SPRING}
                                className={"inline-block"}
                            >
                                {value}×
                            </motion.span>{" "}
                            {kind}
                        </motion.span>
                    ))}
                </AnimatePresence>
            </div>
        </motion.button>
    );
}
