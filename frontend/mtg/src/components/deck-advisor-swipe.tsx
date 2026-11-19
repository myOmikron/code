import { ArrowUturnLeftIcon, ChevronLeftIcon } from "@heroicons/react/20/solid";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/solid";
import clsx from "clsx";
import { Text } from "components";
import type { TFunction } from "i18next";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import type { Variants } from "motion/react";
import { ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SuggestionGroup } from "src/api/graph-generated";
import { DeckAdvisorImpactBadges } from "src/components/deck-advisor-impact-badges";
import { PrimaryButton } from "src/components/primary-button";
import type { Move } from "src/utils/advisor-moves";
import { AddMove, SwipePackage, swipePackages } from "src/utils/advisor-packages";
import { SWIPE_DISTANCE, swipeDirection } from "src/utils/dating";
import { suggestionAddQuantity } from "src/utils/deck-advisor";
import { formatCurrency } from "src/utils/format";
import type { Printing } from "src/utils/scryfall";
import { useShortcuts } from "src/utils/use-shortcuts";

/** The card on screen, with the printing it was shown with */
type Shown = { move: AddMove; printing: Printing };

/** The package on screen, with the printings it was shown with */
type ShownPackage = { pack: SwipePackage; printings: Map<string, Printing> };

/** One swipe, as undo takes it back */
type Swiped =
    { kind: "card"; shown: Shown } | { kind: "package"; shown: ShownPackage; left: Set<string>; added: boolean };

/** Where a card flies: right into the deck, left away */
const LEAVE: Variants = {
    leave: (direction: "left" | "right" | null) => ({
        x: direction === "left" ? "-120%" : direction === "right" ? "120%" : 0,
        rotate: direction === "left" ? -20 : direction === "right" ? 20 : 0,
        opacity: 0,
        transition: { duration: 0.25, ease: "easeIn" },
    }),
};

/** A round action button, a labelled pill with its key on desktop */
const ROUND =
    "flex items-center justify-center gap-2.5 rounded-full ring-1 shadow-(--shadow-card-sm) transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500 lg:w-auto lg:px-4.5 lg:text-[0.95rem]";

/** The key that does the same, desktop only */
const KEY = "hidden rounded-sm px-1.5 font-sans text-xs font-normal ring-1 lg:inline";

/** The key cap on a quiet button */
const QUIET_KEY = "text-zinc-500 ring-zinc-950/10 dark:text-zinc-400 dark:ring-white/15";

/** A fact tile of the desktop panel */
const TILE = "rounded-(--radius-control) bg-zinc-100 px-3 py-2.5 dark:bg-zinc-800";

/** A quiet round button */
const QUIET = "bg-white ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10";

/** A small chip under the card */
const CHIP =
    "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

/**
 * The properties for {@link DeckAdvisorSwipe}
 */
export type DeckAdvisorSwipeProps = {
    /** The advisor's add moves, best first */
    moves: Array<Move>;
    /** The report's suggestion groups, which packages are cut from */
    groups: Array<SuggestionGroup>;
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
    /** Whether the last add or never can be undone */
    canUndo: boolean;
    /** Right: add the card */
    onAdd: (move: AddMove) => Promise<void>;
    /** Left: never suggest it again */
    onNever: (move: AddMove) => void;
    /** Right on a package: add the chosen cards, never suggest the ones tapped away */
    onAddPackage: (chosen: Array<AddMove>, left: Array<AddMove>) => Promise<void>;
    /** Undo the last add or never */
    onUndo: () => Promise<void>;
    /** Back to the advisor */
    onClose: () => void;
};

/**
 * Card swiping: packages of one theme first, then the advisor's suggestions one at a time.
 * Right adds, left never shows the card again; left on a package only skips it.
 *
 * @returns the full-screen overlay
 */
export function DeckAdvisorSwipe(props: DeckAdvisorSwipeProps) {
    const { moves, groups, cards, count, target, colors, themeLabels, loading, canUndo } = props;
    const { onAdd, onNever, onAddPackage, onUndo, onClose } = props;
    const [t] = useTranslation("advisor");
    const [exit, setExit] = useState<"left" | "right" | null>(null);
    const [busy, setBusy] = useState(false);
    // Pinned until swiped: a late graph answer re-ranks the moves and must not swap what is on screen.
    const [shown, setShown] = useState<Shown | null>(null);
    const [shownPackage, setShownPackage] = useState<ShownPackage | null>(null);
    const [left, setLeft] = useState<Set<string>>(new Set());
    const [singles, setSingles] = useState(false);
    const [swiped, setSwiped] = useState<Array<Swiped>>([]);

    const full = count >= target;
    const handled = new Set(
        swiped.flatMap((entry) =>
            entry.kind === "card"
                ? [entry.shown.move.oracle_id]
                : entry.added
                  ? entry.shown.pack.moves.map((move) => move.oracle_id)
                  : [],
        ),
    );
    const ready = moves.filter(
        (move): move is AddMove => move.kind === "add" && cards.has(move.name) && !handled.has(move.oracle_id),
    );

    // Packages until none is left or the player asks for single cards
    const seen = new Set(swiped.flatMap((entry) => (entry.kind === "package" ? [entry.shown.pack.key] : [])));
    const offer =
        singles || full ? undefined : swipePackages({ groups, moves: ready, room: target - count, colors, seen })[0];
    if (shownPackage === null && offer !== undefined && (!loading || swiped.length > 0)) {
        setShownPackage({
            pack: offer,
            printings: new Map(offer.moves.map((move) => [move.name, cards.get(move.name)!])),
        });
        setLeft(new Set());
    }
    const packageMode =
        !singles && !full && (shownPackage !== null || offer !== undefined || (loading && swiped.length === 0));
    const pack = packageMode ? (shownPackage ?? undefined) : undefined;

    const next = packageMode ? undefined : ready[0];
    if (!packageMode && shown === null && next !== undefined) setShown({ move: next, printing: cards.get(next.name)! });
    const current = packageMode
        ? undefined
        : (shown ?? (next === undefined ? undefined : { move: next, printing: cards.get(next.name)! }));
    // The freshest facts and badges for the pinned card, while the graph still suggests it
    const top =
        current &&
        (moves.find((move): move is AddMove => move.kind === "add" && move.oracle_id === current.move.oracle_id) ??
            current.move);

    const last = swiped.at(-1);
    const undoable = canUndo || (last?.kind === "package" && !last.added);

    const undo = async () => {
        if (last === undefined) {
            await onUndo();
            return;
        }
        setExit(null);
        setSwiped((held) => held.slice(0, -1));
        if (last.kind === "card") {
            setShown(last.shown);
            await onUndo();
            return;
        }
        setSingles(false);
        setShownPackage(last.shown);
        setLeft(last.left);
        if (last.added) await onUndo();
    };

    const decide = async (direction: "left" | "right") => {
        if (current === undefined || top === undefined || busy) return;
        setExit(direction);
        setSwiped((held) => [...held, { kind: "card", shown: current }]);
        setShown(null);
        setBusy(true);
        try {
            if (direction === "right") await onAdd(top);
            else onNever(top);
        } finally {
            setBusy(false);
        }
    };

    const decidePackage = async (direction: "left" | "right") => {
        if (pack === undefined || busy) return;
        const added = direction === "right";
        setExit(direction);
        setSwiped((held) => [...held, { kind: "package", shown: pack, left, added }]);
        setShownPackage(null);
        if (!added) return;
        setBusy(true);
        try {
            const moves = pack.pack.moves;
            await onAddPackage(
                moves.filter((move) => !left.has(move.oracle_id)),
                moves.filter((move) => left.has(move.oracle_id)),
            );
        } finally {
            setBusy(false);
        }
    };

    const chosen = pack?.pack.moves.filter((move) => !left.has(move.oracle_id)) ?? [];
    const chosenCopies = chosen.reduce(
        (sum, move) => sum + suggestionAddQuantity(move.suggestion.type_line, colors),
        0,
    );
    const chosenPrice = chosen.reduce((sum, move) => sum + (pack?.printings.get(move.name)?.priceEur ?? 0), 0);
    const packagePrice = chosenPrice > 0 ? formatCurrency(chosenPrice) : "";
    const price = current?.printing.priceEur;
    const copies = top === undefined ? 0 : suggestionAddQuantity(top.suggestion.type_line, colors);
    const stuck = full || (pack === undefined && top === undefined) || busy;

    const toSingles = () => {
        setSingles(true);
        setShownPackage(null);
    };

    const toggle = (oracleId: string) =>
        setLeft((held) => {
            const out = new Set(held);
            if (out.has(oracleId)) out.delete(oracleId);
            else out.add(oracleId);
            return out;
        });
    const swipe = (direction: "left" | "right") =>
        full ? undefined : pack !== undefined ? decidePackage(direction) : decide(direction);

    useShortcuts({
        escape: onClose,
        arrowleft: () => swipe("left"),
        arrowright: () => swipe("right"),
        backspace: () => {
            if (undoable && !busy) undo();
        },
        ...Object.fromEntries(
            (pack?.pack.moves ?? [])
                .slice(0, 9)
                .map((move, index) => [String(index + 1), () => toggle(move.oracle_id)]),
        ),
    });

    return (
        <div
            className={
                "fixed inset-0 z-40 flex flex-col bg-(--surface-page) pb-[env(safe-area-inset-bottom)] text-zinc-950 dark:text-white"
            }
        >
            <div className={"mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col lg:max-w-310 lg:px-8 lg:pb-7"}>
                <header
                    className={
                        "flex flex-wrap items-center gap-2 px-2 pt-3 lg:h-19 lg:flex-nowrap lg:gap-4 lg:px-0 lg:pt-0"
                    }
                >
                    <button
                        type={"button"}
                        onClick={onClose}
                        aria-label={t("accessibility.swipe-close")}
                        className={
                            "flex size-11 items-center justify-center gap-1.5 rounded-full lg:h-10 lg:w-auto lg:pr-2.5 lg:pl-1.5"
                        }
                    >
                        <ChevronLeftIcon className={"size-6"} />
                        <kbd className={clsx(KEY, QUIET_KEY)}>Esc</kbd>
                    </button>
                    <p className={"flex-1 font-bold lg:flex-none lg:text-[1.05rem]"}>{t("heading.swipe")}</p>
                    <p className={"pr-3 font-extrabold tabular-nums lg:order-last lg:pr-0"}>
                        {count}
                        <span className={"font-semibold text-zinc-400"}> / {target}</span>
                    </p>
                    <div
                        className={
                            "order-last mx-2 mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-950/10 lg:order-none lg:mx-2 lg:mt-0 lg:h-1.5 lg:w-auto lg:flex-1 dark:bg-white/10"
                        }
                    >
                        <motion.div
                            className={"h-full rounded-full bg-lime-500"}
                            animate={{ width: `${Math.min(100, (count / target) * 100)}%` }}
                        />
                    </div>
                </header>

                <div
                    className={
                        "relative isolate flex min-h-0 flex-1 items-center justify-center px-6 py-4 lg:items-stretch lg:gap-7 lg:px-0 lg:pt-1 lg:pb-0"
                    }
                >
                    {full ? (
                        <div className={"flex flex-col items-center gap-4 text-center"}>
                            <p className={"text-6xl font-extrabold text-lime-500 tabular-nums"}>{target}</p>
                            <p className={"text-2xl font-extrabold"}>{t("heading.swipe-full")}</p>
                            <PrimaryButton onClick={onClose}>{t("button.swipe-open-advisor")}</PrimaryButton>
                        </div>
                    ) : packageMode ? (
                        pack === undefined ? (
                            <Text>{t("description.swipe-loading")}</Text>
                        ) : (
                            <AnimatePresence custom={exit} initial={false}>
                                <PackageCard
                                    key={pack.pack.key}
                                    shown={pack}
                                    label={packageLabel(t, pack.pack, themeLabels)}
                                    left={left}
                                    price={packagePrice}
                                    themeLabels={themeLabels}
                                    addLabel={t("label.swipe-add-stamp")}
                                    skipLabel={t("label.swipe-skip-stamp")}
                                    onToggle={toggle}
                                    onSingles={toSingles}
                                    onSwipe={decidePackage}
                                />
                            </AnimatePresence>
                        )
                    ) : current === undefined || top === undefined ? (
                        <Text>{loading ? t("description.swipe-loading") : t("description.swipe-empty")}</Text>
                    ) : (
                        <>
                            <div className={"relative aspect-[5/7] h-full max-h-[26rem] shrink-0 lg:max-h-none"}>
                                <AnimatePresence custom={exit} initial={false}>
                                    <SwipeShell
                                        key={top.oracle_id}
                                        className={"inset-0"}
                                        addLabel={t("label.swipe-add-stamp")}
                                        otherLabel={t("label.swipe-never-stamp")}
                                        onSwipe={decide}
                                    >
                                        <CardImage printing={current.printing} name={top.name} large={true} />
                                    </SwipeShell>
                                </AnimatePresence>
                            </div>
                            <aside
                                className={
                                    "hidden w-95 shrink-0 flex-col gap-4.5 rounded-2xl bg-white p-7 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/10 lg:flex dark:bg-zinc-900 dark:ring-white/10"
                                }
                            >
                                <div>
                                    <p className={"text-[1.75rem]/tight font-extrabold tracking-tight"}>{top.name}</p>
                                    <p className={"mt-1.5 text-sm text-zinc-500 dark:text-zinc-400"}>
                                        {top.suggestion.type_line}
                                    </p>
                                </div>
                                <p className={"text-lg/snug font-semibold text-zinc-800 dark:text-zinc-100"}>
                                    {top.fact}
                                </p>
                                <div className={"flex flex-wrap items-center gap-1.5"}>
                                    <DeckAdvisorImpactBadges badges={top.badges} themeLabels={themeLabels} />
                                </div>
                                <dl className={"mt-auto grid grid-cols-2 gap-2"}>
                                    <div className={TILE}>
                                        <dt className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                                            {t("label.swipe-price")}
                                        </dt>
                                        <dd className={"font-bold"}>{price != null ? formatCurrency(price) : "–"}</dd>
                                    </div>
                                    <div className={TILE}>
                                        <dt className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                                            {t("label.swipe-copies")}
                                        </dt>
                                        <dd className={"font-bold"}>{copies}</dd>
                                    </div>
                                </dl>
                            </aside>
                        </>
                    )}
                </div>

                {pack !== undefined && (
                    <div className={"flex flex-col gap-2 px-5 lg:hidden"}>
                        <div className={"flex items-baseline justify-between gap-3"}>
                            <p className={"text-sm/snug text-zinc-700 dark:text-zinc-300"}>
                                {t("description.swipe-package")}
                            </p>
                            <p className={"shrink-0 text-sm font-semibold text-zinc-500 dark:text-zinc-400"}>
                                {packagePrice}
                            </p>
                        </div>
                        <div className={"flex items-center justify-between gap-2"}>
                            <span className={CHIP}>{t("label.swipe-adds", { count: chosenCopies })}</span>
                            <button
                                type={"button"}
                                onClick={toSingles}
                                className={"text-sm font-semibold text-lime-700 dark:text-lime-400"}
                            >
                                {t("button.swipe-singles")}
                            </button>
                        </div>
                    </div>
                )}

                {!full && !packageMode && top !== undefined && (
                    <div className={"flex flex-col gap-2 px-5 lg:hidden"}>
                        <div className={"flex items-baseline justify-between gap-3"}>
                            <p className={"text-sm/snug text-zinc-700 dark:text-zinc-300"}>{top.fact}</p>
                            <p className={"shrink-0 text-sm font-semibold text-zinc-500 dark:text-zinc-400"}>
                                {price != null ? formatCurrency(price) : ""}
                            </p>
                        </div>
                        <div className={"flex flex-wrap items-center gap-1.5"}>
                            <DeckAdvisorImpactBadges badges={top.badges} themeLabels={themeLabels} />
                            {copies > 1 && <span className={CHIP}>{t("label.swipe-adds", { count: copies })}</span>}
                        </div>
                    </div>
                )}

                <div className={"flex items-center justify-center gap-5 py-5 lg:pt-5.5 lg:pb-0"}>
                    <button
                        type={"button"}
                        onClick={undo}
                        disabled={!undoable || busy}
                        aria-label={t("accessibility.swipe-undo")}
                        className={clsx(ROUND, QUIET, "size-12 text-amber-500 lg:gap-2 lg:px-3.5")}
                    >
                        <ArrowUturnLeftIcon className={"size-5"} />
                        <kbd className={clsx(KEY, QUIET_KEY)}>⌫</kbd>
                    </button>
                    <button
                        type={"button"}
                        onClick={() => swipe("left")}
                        disabled={stuck}
                        aria-label={pack !== undefined ? t("accessibility.swipe-skip") : t("accessibility.swipe-never")}
                        className={clsx(ROUND, QUIET, "size-16 font-semibold text-zinc-700 lg:h-15 dark:text-zinc-200")}
                    >
                        <XMarkIcon className={"size-8 lg:size-6"} />
                        <span className={"hidden lg:inline"}>
                            {pack !== undefined ? t("button.swipe-skip") : t("button.swipe-never")}
                        </span>
                        <kbd className={clsx(KEY, QUIET_KEY)}>←</kbd>
                    </button>
                    <button
                        type={"button"}
                        onClick={() => swipe("right")}
                        disabled={stuck}
                        aria-label={
                            pack !== undefined ? t("accessibility.swipe-add-package") : t("accessibility.swipe-add")
                        }
                        className={clsx(ROUND, "size-16 bg-lime-400 font-bold text-lime-950 ring-lime-500 lg:h-15")}
                    >
                        <PlusIcon className={"size-8 lg:size-6"} />
                        <span className={"hidden lg:inline"}>
                            {pack !== undefined
                                ? t("button.swipe-add-package", { count: chosenCopies })
                                : t("button.swipe-add")}
                        </span>
                        <kbd className={clsx(KEY, "text-lime-900 ring-lime-600")}>→</kbd>
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * What a package is called: the theme's own label, a translated bucket, or the service's label
 *
 * @param t the advisor translations
 * @param pack the package
 * @param themeLabels theme id to label
 * @returns the heading
 */
function packageLabel(t: TFunction, pack: SwipePackage, themeLabels: Record<string, string>): string {
    const [kind, id = ""] = pack.key.split(/:(.*)/s);
    switch (kind) {
        case "theme":
            return themeLabels[id] ?? pack.label;
        case "bucket":
            return t(`label.bucket-${id.replace(/[_ ]/g, "-")}`, { defaultValue: pack.label });
        case "combo":
            return t("label.swipe-package-combo");
        case "staples":
            return t("label.swipe-package-staples");
        default:
            return pack.label;
    }
}

/**
 * The draggable shell a swipe flies in, with its stamps.
 *
 * @param props what is dragged and what a swipe does
 * @param props.className size and shape of the shell
 * @param props.addLabel stamp shown while dragging right
 * @param props.otherLabel stamp shown while dragging left
 * @param props.onSwipe a finished swipe
 * @param props.onDragStart a drag began, so a tap that ends it is not a tap
 * @param props.children what is shown
 * @returns the shell
 */
function SwipeShell(props: {
    className: string;
    addLabel: string;
    otherLabel: string;
    onSwipe: (direction: "left" | "right") => void;
    onDragStart?: () => void;
    children: ReactNode;
}) {
    const { className, addLabel, otherLabel, onSwipe, onDragStart, children } = props;
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-240, 240], [-14, 14]);
    const add = useTransform(x, [20, SWIPE_DISTANCE], [0, 1]);
    const other = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0]);

    return (
        <motion.div
            className={clsx("absolute touch-none select-none", className)}
            style={{ x, rotate }}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            variants={LEAVE}
            exit={"leave"}
            drag={"x"}
            dragSnapToOrigin={true}
            dragElastic={0.9}
            onDragStart={onDragStart}
            onDragEnd={(_event, info) => {
                const direction = swipeDirection(info.offset, info.velocity);
                if (direction === "left" || direction === "right") onSwipe(direction);
            }}
        >
            {children}
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
                style={{ opacity: other }}
                className={
                    "absolute top-10 right-4 rotate-12 rounded-lg border-4 border-zinc-200 bg-zinc-950/60 px-3 py-1 text-2xl font-extrabold text-zinc-100"
                }
            >
                {otherLabel}
            </motion.span>
        </motion.div>
    );
}

/**
 * A card's image, or its name where there is none.
 *
 * @param props the card
 * @param props.printing the printing to show
 * @param props.name card name
 * @param props.large whether the full-size image is worth loading
 * @returns the image
 */
function CardImage(props: { printing: Printing | undefined; name: string; large: boolean }) {
    const { printing, name, large } = props;
    const image = (large ? printing?.largeImageUrl : null) ?? printing?.imageUrl ?? printing?.largeImageUrl ?? null;
    // A small image shown on desktop is drawn larger than it is
    const desktop = large ? null : (printing?.largeImageUrl ?? null);
    return image !== null ? (
        <picture className={"contents"}>
            {desktop !== null && <source media={"(min-width: 64rem)"} srcSet={desktop} />}
            <img
                src={image}
                alt={name}
                draggable={false}
                crossOrigin={"anonymous"}
                className={"size-full rounded-[4.75%/3.5%] object-cover shadow-(--shadow-card-lg)"}
            />
        </picture>
    ) : (
        <div
            className={
                "flex size-full items-center justify-center rounded-xl bg-zinc-800 p-2 text-center text-xs text-white"
            }
        >
            {name}
        </div>
    );
}

/**
 * A package: one theme's cards on one swipe, each tappable to leave it out.
 * On desktop the cards are numbered for their keys, and the one under the pointer is shown large beside them.
 *
 * @param props the package and what tapping and swiping do
 * @param props.shown the package with its printings
 * @param props.label its heading
 * @param props.left oracle ids tapped away
 * @param props.price what the chosen cards cost, empty when unknown
 * @param props.themeLabels theme id to label, for the badges
 * @param props.addLabel stamp shown while dragging right
 * @param props.skipLabel stamp shown while dragging left
 * @param props.onToggle a card was tapped
 * @param props.onSingles leave package mode
 * @param props.onSwipe a finished swipe
 * @returns the package card
 */
function PackageCard(props: {
    shown: ShownPackage;
    label: string;
    left: Set<string>;
    price: string;
    themeLabels: Record<string, string>;
    addLabel: string;
    skipLabel: string;
    onToggle: (oracleId: string) => void;
    onSingles: () => void;
    onSwipe: (direction: "left" | "right") => void;
}) {
    const { shown, label, left, price, themeLabels, addLabel, skipLabel, onToggle, onSingles, onSwipe } = props;
    const [t] = useTranslation("advisor");
    // A drag ends in a click on the card under the finger, which must not toggle it
    const dragged = useRef(false);
    const moves = shown.pack.moves;
    const [focusId, setFocusId] = useState(moves[0]?.oracle_id);
    const focus = moves.find((move) => move.oracle_id === focusId) ?? moves[0];
    const focusPrinting = focus === undefined ? undefined : shown.printings.get(focus.name);
    const focusPrice = focusPrinting?.priceEur;
    const focusImage = focusPrinting?.largeImageUrl ?? focusPrinting?.imageUrl ?? undefined;

    return (
        <SwipeShell
            className={"inset-x-6 mx-auto max-w-sm lg:inset-0 lg:max-w-none"}
            addLabel={addLabel}
            otherLabel={skipLabel}
            onSwipe={onSwipe}
            onDragStart={() => {
                dragged.current = true;
            }}
        >
            <div
                onPointerDownCapture={() => {
                    dragged.current = false;
                }}
                className={
                    "rounded-2xl bg-white p-3 shadow-(--shadow-card-lg) ring-1 ring-zinc-950/10 lg:flex lg:h-full lg:flex-col lg:gap-4 lg:px-6 lg:pt-5 lg:pb-6 dark:bg-zinc-900 dark:ring-white/10"
                }
            >
                <div
                    className={
                        "flex items-baseline justify-between gap-2 px-1 pb-2.5 lg:justify-start lg:gap-3.5 lg:p-0"
                    }
                >
                    <p className={"truncate text-lg font-extrabold lg:text-2xl"}>{label}</p>
                    <p className={"shrink-0 text-sm font-semibold text-zinc-500 tabular-nums dark:text-zinc-400"}>
                        {moves.length - left.size} / {moves.length}
                    </p>
                    <p className={"hidden truncate text-sm text-zinc-500 lg:block dark:text-zinc-400"}>
                        {t("description.swipe-package-keys")}
                    </p>
                    <p
                        className={
                            "ml-auto hidden shrink-0 text-sm font-semibold text-zinc-600 lg:block dark:text-zinc-300"
                        }
                    >
                        {price}
                    </p>
                    <button
                        type={"button"}
                        onClick={onSingles}
                        className={"hidden shrink-0 text-sm font-semibold text-lime-700 lg:block dark:text-lime-400"}
                    >
                        {t("button.swipe-singles")}
                    </button>
                </div>
                <div className={"lg:flex lg:min-h-0 lg:flex-1 lg:gap-6"}>
                    <div
                        className={clsx(
                            "grid gap-2 lg:min-w-0 lg:flex-1 lg:grid-cols-4 lg:grid-rows-2 lg:gap-3",
                            moves.length > 6
                                ? "grid-cols-4 max-lg:[@media(min-height:780px)]:grid-cols-3"
                                : "grid-cols-3",
                        )}
                    >
                        {moves.map((move, index) => {
                            const out = left.has(move.oracle_id);
                            return (
                                <button
                                    key={move.oracle_id}
                                    type={"button"}
                                    aria-pressed={!out}
                                    aria-label={t("accessibility.swipe-package-toggle", { name: move.name })}
                                    onClick={() => {
                                        if (!dragged.current) onToggle(move.oracle_id);
                                    }}
                                    onPointerEnter={() => setFocusId(move.oracle_id)}
                                    onFocus={() => setFocusId(move.oracle_id)}
                                    className={
                                        "block min-w-0 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500 active:scale-95 lg:[container-type:size] lg:flex lg:min-h-0 lg:items-center lg:justify-center lg:active:scale-100"
                                    }
                                >
                                    <span
                                        className={clsx(
                                            "relative block aspect-[5/7] w-full rounded-[4.75%/3.5%] lg:w-[min(100cqw,calc(100cqh*5/7))]",
                                            focus?.oracle_id === move.oracle_id && "lg:ring-3 lg:ring-lime-500",
                                        )}
                                    >
                                        <span
                                            className={clsx(
                                                "block size-full transition",
                                                out && "opacity-30 grayscale",
                                            )}
                                        >
                                            <CardImage
                                                printing={shown.printings.get(move.name)}
                                                name={move.name}
                                                large={false}
                                            />
                                        </span>
                                        {index < 9 && (
                                            <kbd
                                                className={
                                                    "absolute top-2 left-2 hidden size-5.5 items-center justify-center rounded-md bg-zinc-950/75 font-sans text-xs font-bold text-white lg:flex"
                                                }
                                            >
                                                {index + 1}
                                            </kbd>
                                        )}
                                        {out && (
                                            <span
                                                className={
                                                    "absolute inset-0 m-auto flex size-8 items-center justify-center rounded-full bg-zinc-950/70 text-white lg:size-10"
                                                }
                                            >
                                                <XMarkIcon className={"size-5"} />
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {focus !== undefined && (
                        <aside
                            className={
                                "hidden w-75 shrink-0 flex-col gap-3.5 overflow-hidden border-l border-zinc-100 pl-6 lg:flex dark:border-white/10"
                            }
                        >
                            <p className={"text-lg font-extrabold"}>{focus.name}</p>
                            {focus.fact && (
                                <p className={"text-[0.95rem]/snug font-semibold text-zinc-800 dark:text-zinc-100"}>
                                    {focus.fact}
                                </p>
                            )}
                            <div className={"flex flex-wrap items-center gap-1.5"}>
                                <DeckAdvisorImpactBadges badges={focus.badges} themeLabels={themeLabels} />
                                {focusPrice != null && <span className={CHIP}>{formatCurrency(focusPrice)}</span>}
                            </div>
                            <span className={"relative min-h-40 flex-1"}>
                                {focusImage !== undefined && (
                                    <img
                                        src={focusImage}
                                        alt={focus.name}
                                        draggable={false}
                                        crossOrigin={"anonymous"}
                                        className={
                                            "absolute inset-x-0 top-0 mx-auto max-h-full max-w-full rounded-[4.75%/3.5%] shadow-(--shadow-card-lg)"
                                        }
                                    />
                                )}
                            </span>
                        </aside>
                    )}
                </div>
            </div>
        </SwipeShell>
    );
}
