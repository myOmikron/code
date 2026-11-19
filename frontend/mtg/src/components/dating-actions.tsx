import { ArrowUturnLeftIcon } from "@heroicons/react/20/solid";
import { HeartIcon, StarIcon, XMarkIcon } from "@heroicons/react/24/solid";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { SwipeDirection } from "src/utils/dating";

/** A round action button under the stack, a pill with its key on desktop */
const ROUND =
    "flex items-center justify-center gap-2 rounded-full ring-1 shadow-(--shadow-card-sm) transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500 lg:w-auto";

/** A quiet round button */
const QUIET = "bg-white ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10";

/** The small action, rewind and Super Like */
const SMALL = "size-12 lg:pr-3.5 lg:pl-4";

/** The big action, pass and like */
const BIG = "size-16 lg:h-15 lg:pr-4 lg:pl-5";

/** The key that does the same, desktop only */
const KEY = "hidden rounded-sm px-1.5 font-sans text-xs font-normal ring-1 lg:inline";

/** The key cap on a quiet button */
const QUIET_KEY = "text-zinc-500 ring-zinc-950/10 dark:text-zinc-400 dark:ring-white/15";

/**
 * The properties for {@link DatingActions}
 */
export type DatingActionsProps = {
    /** Whether there is a card to swipe */
    canSwipe: boolean;
    /** Whether the last swipe can be taken back */
    canRewind: boolean;
    /** Super Likes left today */
    supers: number;
    onSwipe: (direction: SwipeDirection) => void;
    onRewind: () => void;
};

/**
 * Rewind, pass, Super Like and like under the stack.
 *
 * @returns the buttons
 */
export function DatingActions({ canSwipe, canRewind, supers, onSwipe, onRewind }: DatingActionsProps) {
    const [t] = useTranslation("dating");

    return (
        <div className={"flex items-center justify-center gap-4 pt-2 lg:gap-5 lg:pt-0"}>
            <button
                type={"button"}
                onClick={onRewind}
                disabled={!canRewind}
                aria-label={t("button.rewind")}
                className={clsx(ROUND, QUIET, SMALL, "text-amber-500")}
            >
                <ArrowUturnLeftIcon className={"size-5"} />
                <kbd className={clsx(KEY, QUIET_KEY)}>⌫</kbd>
            </button>
            <button
                type={"button"}
                onClick={() => onSwipe("left")}
                disabled={!canSwipe}
                aria-label={t("button.pass")}
                className={clsx(ROUND, QUIET, BIG, "text-zinc-700 dark:text-zinc-200")}
            >
                <XMarkIcon className={"size-8 lg:size-7"} />
                <kbd className={clsx(KEY, QUIET_KEY)}>←</kbd>
            </button>
            <button
                type={"button"}
                onClick={() => onSwipe("up")}
                disabled={!canSwipe || supers <= 0}
                aria-label={t("button.super-like")}
                className={clsx(ROUND, QUIET, SMALL, "relative text-sky-500")}
            >
                <StarIcon className={"size-5"} />
                <span
                    className={
                        "absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-sky-500 text-[0.65rem] font-bold text-white lg:static lg:size-auto lg:bg-transparent lg:text-sm lg:text-sky-600 dark:lg:text-sky-400"
                    }
                >
                    {supers}
                </span>
                <kbd className={clsx(KEY, QUIET_KEY)}>↑</kbd>
            </button>
            <button
                type={"button"}
                onClick={() => onSwipe("right")}
                disabled={!canSwipe}
                aria-label={t("button.like")}
                className={clsx(ROUND, BIG, "bg-lime-400 text-lime-950 ring-lime-500")}
            >
                <HeartIcon className={"size-8 lg:size-7"} />
                <kbd className={clsx(KEY, "text-lime-900 ring-lime-600")}>→</kbd>
            </button>
        </div>
    );
}
