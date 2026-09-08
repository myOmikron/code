import { ArrowDownTrayIcon, Cog6ToothIcon, PhotoIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import { useFooterDodge } from "src/utils/use-footer-dodge";

/**
 * The properties for {@link MpcFillOrderDock}
 */
export type MpcFillOrderDockProps = {
    /** How many cards the order holds */
    count: number;
    /** The bracket it is charged as, `null` when it no longer fits in one order */
    bracket: number | null;
    /** How many cards still have no art picked */
    missing: number;
    /** The thumbnail of the chosen card back, `null` while none is chosen */
    cardback: string | null;
    /** Whether the order file can be written */
    ready: boolean;
    /** Opens the choice of card backs */
    onCardback: () => void;
    /** Opens the cardstock, finish and text list */
    onSettings: () => void;
    /** Hands the order file to the browser */
    onDownload: () => void;
};

/**
 * What the order adds up to, wherever the reader is in the grid.
 *
 * Pinned to the bottom edge because the grid is as long as the deck: the count,
 * the bracket it has reached and the cards still missing art are the three
 * numbers that decide whether the order is done, and scrolling back up to a
 * header to read them is what turns picking a hundred cards into a chore.
 *
 * It steps aside for the footer strip as that comes into view — the imprint and
 * the privacy policy have to stay reachable.
 *
 * @returns the dock
 */
export function MpcFillOrderDock({
    count,
    bracket,
    missing,
    cardback,
    ready,
    onCardback,
    onSettings,
    onDownload,
}: MpcFillOrderDockProps) {
    const [t] = useTranslation("game-utils");
    const lift = useFooterDodge();

    return (
        <aside
            aria-label={t("heading.order-list")}
            style={{ bottom: `${lift}px` }}
            className={
                "pointer-events-none fixed inset-x-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4"
            }
        >
            <div
                className={
                    "pointer-events-auto mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-zinc-950/15 bg-zinc-200/90 p-1.5 shadow-(--shadow-card-lg) backdrop-blur-xl dark:border-white/15 dark:bg-zinc-800/90"
                }
            >
                <span className={"px-2 text-xs text-zinc-600 tabular-nums dark:text-zinc-300"}>
                    {bracket === null
                        ? t("label.card-count", { count })
                        : `${t("label.card-count", { count })} · ${t("label.bracket", { cards: bracket })}`}
                </span>

                <span
                    className={
                        missing === 0
                            ? "rounded-xl bg-(--color-success)/15 px-2 py-1 text-xs text-(--color-success)"
                            : "rounded-xl bg-(--color-warning)/20 px-2 py-1 text-xs text-(--color-warning)"
                    }
                >
                    {missing === 0 ? t("label.art-complete") : t("label.art-missing", { count: missing })}
                </span>

                <button
                    type={"button"}
                    onClick={onCardback}
                    title={t("button.pick-cardback")}
                    className={
                        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-white/60 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-950/40 dark:hover:text-white"
                    }
                >
                    {cardback === null ? (
                        <PhotoIcon className={"size-4"} />
                    ) : (
                        <img
                            src={cardback}
                            alt={""}
                            className={"aspect-[63/88] h-6 rounded-sm object-cover"}
                            loading={"lazy"}
                        />
                    )}
                    {t("label.cardback")}
                </button>

                <button
                    type={"button"}
                    onClick={onSettings}
                    title={t("heading.order-file")}
                    className={
                        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-white/60 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-950/40 dark:hover:text-white"
                    }
                >
                    <Cog6ToothIcon className={"size-4"} />
                    {t("button.order-settings")}
                </button>

                <button
                    type={"button"}
                    onClick={onDownload}
                    disabled={!ready}
                    className={
                        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-(--color-brand-500) px-3 py-1.5 text-xs font-medium text-white transition hover:bg-(--color-brand-600) disabled:cursor-default disabled:opacity-50"
                    }
                >
                    <ArrowDownTrayIcon className={"size-4"} />
                    {t("button.download-xml")}
                </button>
            </div>
        </aside>
    );
}
