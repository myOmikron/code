import { ArrowUturnLeftIcon, ChevronLeftIcon } from "@heroicons/react/20/solid";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/solid";
import clsx from "clsx";
import { Text } from "components";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import type { Variants } from "motion/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeckAdvisorImpactBadges } from "src/components/deck-advisor-impact-badges";
import { PrimaryButton } from "src/components/primary-button";
import type { Move } from "src/utils/advisor-moves";
import { SWIPE_DISTANCE, swipeDirection } from "src/utils/dating";
import { suggestionAddQuantity } from "src/utils/deck-advisor";
import { formatCurrency } from "src/utils/format";
import type { Printing } from "src/utils/scryfall";

/** An add move, the only kind swiping shows */
type AddMove = Extract<Move, { kind: "add" }>;

/** The card on screen, with the printing it was shown with */
type Shown = { move: AddMove; printing: Printing };

/** Where a card flies: right into the deck, left away */
const LEAVE: Variants = {
    leave: (direction: "left" | "right" | null) => ({
        x: direction === "left" ? -640 : direction === "right" ? 640 : 0,
        rotate: direction === "left" ? -20 : direction === "right" ? 20 : 0,
        opacity: 0,
        transition: { duration: 0.25, ease: "easeIn" },
    }),
};

/** A round action button */
const ROUND =
    "flex items-center justify-center rounded-full ring-1 shadow-(--shadow-card-sm) transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500";

/** A quiet round button */
const QUIET = "bg-white ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10";

/**
 * The properties for {@link DeckAdvisorSwipe}
 */
export type DeckAdvisorSwipeProps = {
    /** The advisor's add moves, best first */
    moves: Array<Move>;
    /** Resolved printings by card name */
    cards: Map<string, Printing>;
    /** Cards in the main deck and command zone */
    count: number;
    /** The size the deck is built to */
    target: number;
    /** The deck's color count, for how many basics an add places */
    colors: number;
    /** Theme id to label, for the badges */
    themeLabels: Record<string, string>;
    /** Whether the advisor is still working out the moves */
    loading: boolean;
    /** Whether the last swipe can be undone */
    canUndo: boolean;
    /** Right: add the card */
    onAdd: (move: AddMove) => Promise<void>;
    /** Left: never suggest it again */
    onNever: (move: AddMove) => void;
    /** Undo the last swipe */
    onUndo: () => Promise<void>;
    /** Back to the advisor */
    onClose: () => void;
};

/**
 * Card swiping: the advisor's suggestions one at a time, right to add, left to never see again.
 *
 * @returns the full-screen overlay
 */
export function DeckAdvisorSwipe(props: DeckAdvisorSwipeProps) {
    const { moves, cards, count, target, colors, themeLabels, loading, canUndo, onAdd, onNever, onUndo, onClose } =
        props;
    const [t] = useTranslation("advisor");
    const [exit, setExit] = useState<"left" | "right" | null>(null);
    const [busy, setBusy] = useState(false);
    // Pinned until swiped: a late graph answer re-ranks the moves and must not swap the card on screen.
    const [shown, setShown] = useState<Shown | null>(null);
    const [swiped, setSwiped] = useState<Array<Shown>>([]);

    const ready = moves.filter((move): move is AddMove => move.kind === "add" && cards.has(move.name));
    const next = ready.find((move) => !swiped.some((held) => held.move.oracle_id === move.oracle_id));
    if (shown === null && next !== undefined) setShown({ move: next, printing: cards.get(next.name)! });
    const current = shown ?? (next === undefined ? undefined : { move: next, printing: cards.get(next.name)! });
    // The freshest facts and badges for the pinned card, while the graph still suggests it
    const top = current && (ready.find((move) => move.oracle_id === current.move.oracle_id) ?? current.move);
    const full = count >= target;

    const undo = async () => {
        const last = swiped.at(-1);
        if (last !== undefined) {
            setExit(null);
            setSwiped((held) => held.slice(0, -1));
            setShown(last);
        }
        await onUndo();
    };

    const decide = async (direction: "left" | "right") => {
        if (current === undefined || top === undefined || busy) return;
        setExit(direction);
        setSwiped((held) => [...held, current]);
        setShown(null);
        setBusy(true);
        try {
            if (direction === "right") await onAdd(top);
            else onNever(top);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className={
                "fixed inset-0 z-40 flex flex-col bg-(--surface-page) pb-[env(safe-area-inset-bottom)] text-zinc-950 dark:text-white"
            }
        >
            <div className={"mx-auto flex w-full max-w-md flex-1 flex-col"}>
                <header className={"flex items-center gap-2 px-2 pt-3"}>
                    <button
                        type={"button"}
                        onClick={onClose}
                        aria-label={t("accessibility.swipe-close")}
                        className={"flex size-11 items-center justify-center rounded-full"}
                    >
                        <ChevronLeftIcon className={"size-6"} />
                    </button>
                    <p className={"flex-1 font-bold"}>{t("heading.swipe")}</p>
                    <p className={"pr-3 font-extrabold tabular-nums"}>
                        {count}
                        <span className={"font-semibold text-zinc-400"}> / {target}</span>
                    </p>
                </header>
                <div className={"mx-4 mt-1 h-1 overflow-hidden rounded-full bg-zinc-950/10 dark:bg-white/10"}>
                    <motion.div
                        className={"h-full rounded-full bg-lime-500"}
                        animate={{ width: `${Math.min(100, (count / target) * 100)}%` }}
                    />
                </div>

                <div className={"relative isolate flex min-h-0 flex-1 items-center justify-center px-6 py-4"}>
                    {full ? (
                        <div className={"flex flex-col items-center gap-4 text-center"}>
                            <p className={"text-6xl font-extrabold text-lime-500 tabular-nums"}>{target}</p>
                            <p className={"text-2xl font-extrabold"}>{t("heading.swipe-full")}</p>
                            <PrimaryButton onClick={onClose}>{t("button.swipe-open-advisor")}</PrimaryButton>
                        </div>
                    ) : current === undefined || top === undefined ? (
                        <Text>{loading ? t("description.swipe-loading") : t("description.swipe-empty")}</Text>
                    ) : (
                        <AnimatePresence custom={exit} initial={false}>
                            <SwipeCard
                                key={top.oracle_id}
                                printing={current.printing}
                                name={top.name}
                                addLabel={t("label.swipe-add-stamp")}
                                neverLabel={t("label.swipe-never-stamp")}
                                onSwipe={decide}
                            />
                        </AnimatePresence>
                    )}
                </div>

                {!full && top !== undefined && (
                    <div className={"flex flex-col gap-2 px-5"}>
                        <div className={"flex items-baseline justify-between gap-3"}>
                            <p className={"text-sm/snug text-zinc-700 dark:text-zinc-300"}>{top.fact}</p>
                            <p className={"shrink-0 text-sm font-semibold text-zinc-500 dark:text-zinc-400"}>
                                {current?.printing.priceEur != null ? formatCurrency(current.printing.priceEur) : ""}
                            </p>
                        </div>
                        <div className={"flex flex-wrap items-center gap-1.5"}>
                            <DeckAdvisorImpactBadges badges={top.badges} themeLabels={themeLabels} />
                            {suggestionAddQuantity(top.suggestion.type_line, colors) > 1 && (
                                <span
                                    className={
                                        "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                    }
                                >
                                    {t("label.swipe-adds", {
                                        count: suggestionAddQuantity(top.suggestion.type_line, colors),
                                    })}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <div className={"flex items-center justify-center gap-5 py-5"}>
                    <button
                        type={"button"}
                        onClick={undo}
                        disabled={!canUndo || busy}
                        aria-label={t("accessibility.swipe-undo")}
                        className={clsx(ROUND, QUIET, "size-12 text-amber-500")}
                    >
                        <ArrowUturnLeftIcon className={"size-5"} />
                    </button>
                    <button
                        type={"button"}
                        onClick={() => decide("left")}
                        disabled={full || top === undefined || busy}
                        aria-label={t("accessibility.swipe-never")}
                        className={clsx(ROUND, QUIET, "size-16 text-zinc-700 dark:text-zinc-200")}
                    >
                        <XMarkIcon className={"size-8"} />
                    </button>
                    <button
                        type={"button"}
                        onClick={() => decide("right")}
                        disabled={full || top === undefined || busy}
                        aria-label={t("accessibility.swipe-add")}
                        className={clsx(ROUND, "size-16 bg-lime-400 text-lime-950 ring-lime-500")}
                    >
                        <PlusIcon className={"size-8"} />
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * One draggable card image with its stamps.
 *
 * @param props the card and what a swipe does
 * @param props.printing the printing to show
 * @param props.name card name
 * @param props.addLabel stamp shown while dragging right
 * @param props.neverLabel stamp shown while dragging left
 * @param props.onSwipe a finished swipe
 * @returns the card
 */
function SwipeCard(props: {
    printing: Printing;
    name: string;
    addLabel: string;
    neverLabel: string;
    onSwipe: (direction: "left" | "right") => void;
}) {
    const { printing, name, addLabel, neverLabel, onSwipe } = props;
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-240, 240], [-14, 14]);
    const add = useTransform(x, [20, SWIPE_DISTANCE], [0, 1]);
    const never = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0]);
    const image = printing.largeImageUrl ?? printing.imageUrl;
    const dragged = useRef(false);

    return (
        <motion.div
            className={"absolute aspect-[5/7] h-full max-h-[26rem] touch-none select-none"}
            style={{ x, rotate }}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            variants={LEAVE}
            exit={"leave"}
            drag={"x"}
            dragSnapToOrigin={true}
            dragElastic={0.9}
            onDragStart={() => {
                dragged.current = true;
            }}
            onDragEnd={(_event, info) => {
                dragged.current = false;
                const direction = swipeDirection(info.offset, info.velocity);
                if (direction === "left" || direction === "right") onSwipe(direction);
            }}
        >
            {image !== null ? (
                <img
                    src={image}
                    alt={name}
                    draggable={false}
                    crossOrigin={"anonymous"}
                    className={"size-full rounded-[4.75%/3.5%] object-cover shadow-(--shadow-card-lg)"}
                />
            ) : (
                <div className={"flex size-full items-center justify-center rounded-xl bg-zinc-800 p-4 text-white"}>
                    {name}
                </div>
            )}
            <motion.span
                aria-hidden={true}
                style={{ opacity: add }}
                className={
                    "absolute top-10 left-4 -rotate-12 rounded-lg border-4 border-lime-400 bg-zinc-950/60 px-3 py-1 text-2xl font-extrabold text-lime-400"
                }
            >
                {addLabel}
            </motion.span>
            <motion.span
                aria-hidden={true}
                style={{ opacity: never }}
                className={
                    "absolute top-10 right-4 rotate-12 rounded-lg border-4 border-zinc-200 bg-zinc-950/60 px-3 py-1 text-2xl font-extrabold text-zinc-100"
                }
            >
                {neverLabel}
            </motion.span>
        </motion.div>
    );
}
