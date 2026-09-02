import { XMarkIcon } from "@heroicons/react/20/solid";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { MenuAt } from "src/components/context-menu";
import { useGoldfishZoneLabel } from "src/components/goldfish-labels";
import { GoldfishZoneGrid } from "src/components/goldfish-zone-grid";
import { QuietButton } from "src/components/quiet-button";
import type { GoldfishCard, GoldfishZone } from "src/utils/goldfish";

/**
 * The properties for {@link GoldfishZoneOverlay}
 */
export type GoldfishZoneOverlayProps = {
    /** The zone being looked through */
    zone: GoldfishZone;
    /** What the zone holds, top first */
    cards: Array<GoldfishCard>;
    /** Which card's menu is open, to mark it */
    menued: string | null;
    /** Shows a card as large as the screen allows */
    onZoom: (card: GoldfishCard) => void;
    /** What a tap does instead of showing the card large */
    onPick?: (card: GoldfishCard) => void;
    /** What the hint above the cards says */
    hint?: string;
    /** Opens a card's menu at a point */
    onOpenMenu: (card: GoldfishCard, at: MenuAt) => void;
    /** Told when the pointer comes to rest on a card, and when it leaves */
    onHover: (card: GoldfishCard | null) => void;
    /** Shuffles the library, offered while looking through it */
    onShuffle: () => void;
    /** Puts the table back */
    onClose: () => void;
    /** Whether the sheet covers the whole screen rather than the table */
    fullscreen?: boolean;
};

/**
 * A zone spread out over the table.
 *
 * Not a dialog: a dialog would take the menu a card opens for a click beside
 * itself. This is a sheet lying on the table, and the table stays where it is.
 *
 * @returns the overlay
 */
export function GoldfishZoneOverlay({
    zone,
    cards,
    menued,
    onZoom,
    onPick,
    hint,
    onOpenMenu,
    onHover,
    onShuffle,
    onClose,
    fullscreen = false,
}: GoldfishZoneOverlayProps) {
    const [t] = useTranslation("goldfish");
    const [tg] = useTranslation();
    const zoneLabel = useGoldfishZoneLabel();

    const sheet = (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={clsx(
                "z-40 flex flex-col overflow-hidden rounded-2xl bg-zinc-950/90 shadow-2xl ring-1 ring-white/15",
                fullscreen ? "fixed inset-2" : "absolute inset-2",
            )}
        >
            <div className={"flex items-center gap-3 border-b border-white/10 px-4 py-2"}>
                <span className={"text-[11px]/4 font-semibold tracking-[0.25em] text-white/70 uppercase"}>
                    {zoneLabel(zone)}
                </span>
                <span className={"text-xs text-white/50 tabular-nums"}>
                    {t("label.cards-count", { count: cards.length })}
                </span>
                <div className={"ml-auto flex items-center gap-1"}>
                    {zone === "library" && (
                        <QuietButton
                            onClick={onShuffle}
                            className={"text-white/70 ring-white/15 hover:bg-white/10 hover:text-white"}
                        >
                            {t("button.shuffle")}
                        </QuietButton>
                    )}
                    <button
                        type={"button"}
                        onClick={onClose}
                        aria-label={tg("button.close")}
                        title={`${tg("button.close")} · Esc`}
                        className={
                            "rounded-full p-1 text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 hover:text-white"
                        }
                    >
                        <XMarkIcon className={"size-4"} />
                    </button>
                </div>
            </div>
            <div className={"min-h-0 grow overflow-y-auto"}>
                <GoldfishZoneGrid
                    zone={zone}
                    cards={cards}
                    menued={menued}
                    onZoom={onZoom}
                    onPick={onPick}
                    hint={hint}
                    onOpenMenu={onOpenMenu}
                    onHover={onHover}
                />
            </div>
        </motion.div>
    );

    return fullscreen ? createPortal(sheet, document.body) : sheet;
}
