import { BookmarkIcon, EyeSlashIcon, LockClosedIcon, MinusIcon, PlusIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { motion } from "motion/react";
import { Ref, memo } from "react";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { BracketBreakMark } from "src/components/bracket-break-mark";
import { CardOverlayAction } from "src/components/card-overlay-action";
import { CardThumbnail } from "src/components/card-thumbnail";
import { DeckAdvisorImpactBadges } from "src/components/deck-advisor-impact-badges";
import { GameChangerMarker } from "src/components/game-changer-marker";
import { ManaCost } from "src/components/mana-cost";
import type { Move } from "src/utils/advisor-moves";
import type { BracketRuleCheck } from "src/utils/deck-rules";
import { formatCurrency } from "src/utils/format";
import { Printing } from "src/utils/scryfall";
import { pointerCard } from "src/utils/use-pointer-card";

/**
 * The properties for {@link DeckAdvisorMoveTile}
 */
export type DeckAdvisorMoveTileProps = {
    move: Move;
    /** The resolved card, once the catalog has placed the name */
    printing?: Printing;
    /** Theme id to label, for the badges */
    themeLabels: Record<string, string>;
    /** The dimension the gallery is filtered by */
    highlight: string | null;
    /** Opens the card */
    onOpen: (move: Move) => void;
    /** Adds the card, cuts it, or asks what makes room for it */
    onPrimary: (move: Move) => void;
    /** Never suggests the card again (adds only) */
    onIgnore: (move: Move) => void;
    /** Parks the card on the maybe list (adds only) */
    onMaybe: (move: Move) => void;
    /** Whether the card is on the maybe list already */
    inMaybe: boolean;
    /** Keeps the card out of the cuts for good (cuts only) */
    onKeep: (move: Move) => void;
    /** Whether a change is in flight for this card */
    busy: boolean;
    /** The rules of the deck's Bracket claim adding the card would break */
    breaks?: Array<BracketRuleCheck>;
    /** The bracket the deck claims, `null` when it claims none */
    bracket?: number | null;
    /** Handed to the root for `AnimatePresence`'s pop layout */
    ref?: Ref<HTMLLIElement>;
};

/** The quiet icon buttons in a tile's footer */
const FOOT_BUTTON =
    "rounded-(--radius-control) p-1.5 text-zinc-400 transition hover:bg-lime-400/15 hover:text-lime-700 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-500 dark:hover:bg-lime-400/15 dark:hover:text-lime-300 pointer-coarse:p-2.5";

/**
 * One move, artwork first: the same tile whether the card goes in or out,
 * with what it does to the deck as impact badges.
 *
 * @returns the tile
 */
export const DeckAdvisorMoveTile = memo(function DeckAdvisorMoveTile({
    move,
    printing,
    themeLabels,
    highlight,
    onOpen,
    onPrimary,
    onIgnore,
    onMaybe,
    inMaybe,
    onKeep,
    busy,
    breaks,
    bracket,
    ref,
}: DeckAdvisorMoveTileProps) {
    const [t] = useTranslation("advisor");
    const adding = move.kind === "add";
    const price = adding ? printing?.priceEur : null;

    return (
        <motion.li
            ref={ref}
            {...pointerCard(move.oracle_id)}
            layout
            layoutId={move.oracle_id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={
                "group flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 transition hover:shadow-(--shadow-card-md) dark:ring-white/10"
            }
        >
            <div className={"relative bg-zinc-100 dark:bg-zinc-800"}>
                <CardThumbnail
                    name={move.name}
                    image={printing?.largeImageUrl ?? null}
                    thumbnail={printing?.imageUrl ?? null}
                    sizes={"(min-width: 1024px) 220px, 45vw"}
                    finish={CardFinish.Nonfoil}
                    className={clsx(
                        "w-full transition duration-300 group-hover:scale-[1.02]",
                        !adding && "opacity-75 grayscale-[60%]",
                    )}
                />
                <button
                    type={"button"}
                    onClick={() => onOpen(move)}
                    disabled={printing === undefined}
                    title={t("accessibility.open-card", { name: move.name })}
                    aria-label={t("accessibility.open-card", { name: move.name })}
                    className={
                        "absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-default"
                    }
                />
                <span
                    className={
                        "pointer-events-none absolute inset-0 bg-zinc-950/40 opacity-0 transition duration-200 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:hidden"
                    }
                />
                {adding && move.suggestion.game_changer === true && <GameChangerMarker variant={"overlay"} />}
                {adding && bracket != null && breaks !== undefined && (
                    <span className={"absolute bottom-2 left-2 z-10"}>
                        <BracketBreakMark breaks={breaks} bracket={bracket} />
                    </span>
                )}
                <div
                    className={
                        "pointer-events-none absolute inset-0 flex scale-95 items-center justify-center p-2 opacity-0 transition duration-200 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:scale-100 group-hover:opacity-100 pointer-coarse:scale-100 pointer-coarse:items-end pointer-coarse:justify-end pointer-coarse:opacity-100"
                    }
                >
                    <CardOverlayAction
                        icon={adding ? PlusIcon : MinusIcon}
                        size={"md"}
                        label={t(adding ? "accessibility.add-card" : "accessibility.cut-card", { name: move.name })}
                        onClick={() => onPrimary(move)}
                        busy={busy}
                        disabled={adding && printing === undefined}
                        className={
                            "pointer-events-none group-focus-within:pointer-events-auto group-hover:pointer-events-auto pointer-coarse:pointer-events-auto"
                        }
                    />
                </div>
            </div>

            <div className={"flex min-w-0 flex-1 flex-col gap-2 p-3"}>
                <div className={"flex items-baseline justify-between gap-2"}>
                    <span className={"truncate text-sm/6 font-medium text-zinc-950 dark:text-white"}>{move.name}</span>
                    {printing !== undefined && printing.manaCost !== "" && (
                        <ManaCost value={printing.manaCost} className={"shrink-0 text-xs"} />
                    )}
                </div>
                {move.fact !== "" && (
                    <p className={"line-clamp-2 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{move.fact}</p>
                )}
                <DeckAdvisorImpactBadges badges={move.badges} themeLabels={themeLabels} highlight={highlight} />

                <div
                    className={
                        "mt-auto flex items-center justify-between gap-2 border-t border-zinc-950/5 pt-2 dark:border-white/10"
                    }
                >
                    <span className={"text-xs/5 text-zinc-500 tabular-nums dark:text-zinc-400"}>
                        {price == null ? "" : formatCurrency(price)}
                    </span>
                    <span className={"flex items-center gap-1"}>
                        {adding ? (
                            <>
                                <button
                                    type={"button"}
                                    onClick={() => onIgnore(move)}
                                    title={t("accessibility.ignore-card", { name: move.name })}
                                    aria-label={t("accessibility.ignore-card", { name: move.name })}
                                    className={FOOT_BUTTON}
                                >
                                    <EyeSlashIcon className={"size-4"} />
                                </button>
                                <button
                                    type={"button"}
                                    onClick={() => onMaybe(move)}
                                    disabled={busy || printing === undefined || inMaybe}
                                    title={
                                        inMaybe
                                            ? t("label.in-maybe")
                                            : t("accessibility.maybe-card", { name: move.name })
                                    }
                                    aria-label={
                                        inMaybe
                                            ? t("label.in-maybe")
                                            : t("accessibility.maybe-card", { name: move.name })
                                    }
                                    className={FOOT_BUTTON}
                                >
                                    <BookmarkIcon className={"size-4"} />
                                </button>
                            </>
                        ) : (
                            <button
                                type={"button"}
                                onClick={() => onKeep(move)}
                                disabled={busy}
                                title={t("accessibility.keep-card", { name: move.name })}
                                aria-label={t("accessibility.keep-card", { name: move.name })}
                                className={FOOT_BUTTON}
                            >
                                <LockClosedIcon className={"size-4"} />
                            </button>
                        )}
                    </span>
                </div>
            </div>
        </motion.li>
    );
});
