import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Input, InputGroup, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuAt } from "src/components/context-menu";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import { FoilFrame } from "src/components/foil-frame";
import type { GoldfishCard, GoldfishZone } from "src/utils/goldfish";
import { pointerCard } from "src/utils/use-pointer-card";

/**
 * The properties for {@link GoldfishZoneGrid}
 */
export type GoldfishZoneGridProps = {
    /** The zone being looked through */
    zone: GoldfishZone;
    /** What the zone holds, top first */
    cards: Array<GoldfishCard>;
    /** Which card's menu is open, to mark it */
    menued: string | null;
    /** Shows a card as large as the screen allows */
    onZoom: (card: GoldfishCard) => void;
    /** What a tap does instead of showing the card large, where a zone has a better use for it */
    onPick?: (card: GoldfishCard) => void;
    /** What the hint above the cards says, where the zone's use differs */
    hint?: string;
    /** Opens a card's menu at a point */
    onOpenMenu: (card: GoldfishCard, at: MenuAt) => void;
    /** Told when the pointer comes to rest on a card, and when it leaves */
    onHover: (card: GoldfishCard | null) => void;
};

/**
 * Every card in one zone, laid out as a grid in place of the table.
 *
 * A click shows the card large, a right-click or a long press opens the same
 * menu a card on the table has.
 *
 * @returns the grid
 */
export function GoldfishZoneGrid({
    zone,
    cards,
    menued,
    onZoom,
    onPick,
    hint,
    onOpenMenu,
    onHover,
}: GoldfishZoneGridProps) {
    const [t] = useTranslation("goldfish");
    const [filter, setFilter] = useState("");

    const needle = filter.trim().toLowerCase();
    const shown = needle === "" ? cards : cards.filter((card) => card.name.toLowerCase().includes(needle));

    return (
        <div className={"flex flex-col gap-3 p-3"}>
            <div className={"flex flex-wrap items-center gap-3"}>
                <Text className={"text-xs text-white/60"}>
                    {zone === "library" ? `${t("description.library-search")} ` : ""}
                    {hint ?? t("description.pick-card")}
                </Text>
                {cards.length > 8 && (
                    <InputGroup className={"ml-auto w-56"}>
                        <MagnifyingGlassIcon />
                        <Input
                            value={filter}
                            placeholder={t("label.filter-cards")}
                            onChange={(event) => setFilter(event.target.value)}
                        />
                    </InputGroup>
                )}
            </div>
            {shown.length === 0 ? (
                <div className={"py-6 text-center text-sm text-white/50"}>{t("description.empty-zone")}</div>
            ) : (
                <ul className={"grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"}>
                    <AnimatePresence mode={"popLayout"}>
                        {shown.map((card, index) => {
                            const image = card.flipped ? card.backImage : card.image;
                            return (
                                <motion.li
                                    key={card.id}
                                    layout={true}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                >
                                    <button
                                        type={"button"}
                                        onClick={() => (onPick ?? onZoom)(card)}
                                        onMouseEnter={() => onHover(card)}
                                        onMouseLeave={() => onHover(null)}
                                        title={card.name}
                                        {...pointerCard(card.id)}
                                        {...contextMenuTrigger((at) => onOpenMenu(card, at))}
                                        className={clsx(
                                            CONTEXT_MENU_TARGET,
                                            "group flex w-full flex-col gap-1 rounded-lg p-1 text-left transition outline-none",
                                            "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-400",
                                            menued === card.id && "bg-blue-500/20 ring-2 ring-blue-400",
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
                                                <img
                                                    src={image}
                                                    alt={card.name}
                                                    draggable={false}
                                                    className={"size-full object-cover"}
                                                />
                                            ) : (
                                                <div
                                                    className={
                                                        "flex size-full items-center justify-center p-1 text-center text-xs text-white"
                                                    }
                                                >
                                                    {card.name}
                                                </div>
                                            )}
                                        </FoilFrame>
                                        <span className={"flex items-baseline justify-between gap-1"}>
                                            <span className={"truncate text-xs text-white/80"}>{card.name}</span>
                                            {zone === "library" && (
                                                <span className={"shrink-0 text-[10px] text-white/50 tabular-nums"}>
                                                    #{index + 1}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </motion.li>
                            );
                        })}
                    </AnimatePresence>
                </ul>
            )}
        </div>
    );
}
