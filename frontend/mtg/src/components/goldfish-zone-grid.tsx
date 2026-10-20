import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { AnimatePresence, motion } from "motion/react";
import { Input, InputGroup, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuAt } from "src/components/context-menu";
import { GoldfishZoneCard } from "src/components/goldfish-zone-card";
import type { GoldfishCard, GoldfishZone } from "src/utils/goldfish";

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
                        {shown.map((card, index) => (
                            <motion.li
                                key={card.id}
                                layout={true}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            >
                                <GoldfishZoneCard
                                    card={card}
                                    position={zone === "library" ? index + 1 : null}
                                    menued={menued === card.id}
                                    onClick={() => (onPick ?? onZoom)(card)}
                                    onOpenMenu={(at) => onOpenMenu(card, at)}
                                    onHover={(hovering) => onHover(hovering ? card : null)}
                                />
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}
        </div>
    );
}
