import clsx from "clsx";
import type { MenuAt } from "src/components/context-menu";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import { FoilFrame } from "src/components/foil-frame";
import type { GoldfishCard } from "src/utils/goldfish";
import { pointerCard } from "src/utils/use-pointer-card";

/**
 * The properties for {@link GoldfishZoneCard}
 */
export type GoldfishZoneCardProps = {
    /** The card */
    card: GoldfishCard;
    /** Where in the library it lies, counting from one, `null` outside the library */
    position: number | null;
    /** Whether its menu is open, to mark it */
    menued: boolean;
    /** What a tap does */
    onClick: () => void;
    /** Told when a pointer goes down on the card, before anything else hears of it */
    onPress?: () => void;
    /** Opens the card's menu at a point */
    onOpenMenu: (at: MenuAt) => void;
    /** Told when the pointer comes to rest on the card, and when it leaves */
    onHover: (hovering: boolean) => void;
};

/**
 * One card of a spread-out zone, face up with its name beneath.
 *
 * A right-click or a long press opens the same menu a card on the table has.
 *
 * @returns the card
 */
export function GoldfishZoneCard({
    card,
    position,
    menued,
    onClick,
    onPress,
    onOpenMenu,
    onHover,
}: GoldfishZoneCardProps) {
    const image = card.flipped ? card.backImage : card.image;
    return (
        <button
            type={"button"}
            onPointerDownCapture={onPress}
            onClick={onClick}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            title={card.name}
            {...pointerCard(card.id)}
            {...contextMenuTrigger(onOpenMenu)}
            className={clsx(
                CONTEXT_MENU_TARGET,
                "group flex w-full flex-col gap-1 rounded-lg p-1 text-left transition outline-none",
                "hover:bg-lime-400/15 focus-visible:ring-2 focus-visible:ring-lime-500",
                menued && "bg-blue-500/20 ring-2 ring-blue-400",
            )}
        >
            <FoilFrame
                finish={card.finish}
                compact={true}
                image={image}
                className={clsx(
                    "relative aspect-5/7 w-full rounded-[4.5%/3.2%] bg-zinc-800 shadow-md ring-1 ring-black/40 transition group-hover:-translate-y-1",
                    card.token && "ring-2 ring-amber-400/80",
                )}
            >
                {image !== null ? (
                    <img src={image} alt={card.name} draggable={false} className={"size-full object-cover"} />
                ) : (
                    <div className={"flex size-full items-center justify-center p-1 text-center text-xs text-white"}>
                        {card.name}
                    </div>
                )}
            </FoilFrame>
            <span className={"flex items-baseline justify-between gap-1"}>
                <span className={"truncate text-xs text-white/80"}>{card.name}</span>
                {position !== null && (
                    <span className={"shrink-0 text-[10px] text-white/50 tabular-nums"}>#{position}</span>
                )}
            </span>
        </button>
    );
}
