import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WatchCount } from "src/utils/watch-list";

/**
 * The properties for {@link WatchStockMeter}
 */
export type WatchStockMeterProps = {
    /** What the entry comes to */
    count: WatchCount;
    /** How many copies are wanted, which is the whole bar */
    wanted: number;
    /** The disclosure mark, where the meter opens the stacks under it */
    chevron?: ReactNode;
};

/**
 * How far along one watched card is, as a bar rather than a sentence.
 *
 * The bar is the wanted copies. What is solid is on the shelf and can be picked
 * up today; what is ghosted is owned but sleeved up in a deck, and what is
 * empty has to be bought. That third distinction is the one a sentence keeps
 * losing: "2 available, 12 in decks" reads as fourteen copies until you work
 * out that twelve of them are spoken for. Here it is one glance.
 *
 * @returns the meter
 */
export function WatchStockMeter({ count, wanted, chevron }: WatchStockMeterProps) {
    const [t] = useTranslation("watch-list");
    const target = Math.max(1, wanted);

    return (
        <div className={"flex flex-col gap-1.5"}>
            <div
                role={"meter"}
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={count.free}
                aria-valuetext={t("label.stock-meter", { free: count.free, wanted: target })}
                className={
                    "flex h-1.5 w-full gap-px overflow-hidden rounded-(--radius-pill) bg-zinc-950/5 dark:bg-white/10"
                }
            >
                <span
                    className={clsx(
                        "block h-full rounded-(--radius-pill) transition-[width] duration-500",
                        "bg-emerald-500",
                    )}
                    style={{ width: `${count.freeShare}%` }}
                />
                <span
                    className={clsx(
                        "block h-full rounded-(--radius-pill) transition-[width] duration-500",
                        "bg-emerald-500/30 dark:bg-emerald-500/40",
                    )}
                    style={{ width: `${count.sleevedShare}%` }}
                />
            </div>

            <p className={"flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400"}>
                <span className={"font-medium text-zinc-950 tabular-nums dark:text-white"}>
                    {t("label.free-of-wanted", { free: count.free, wanted: target })}
                </span>
                {count.sleeved > 0 && (
                    <span className={"tabular-nums"}>{t("label.in-decks", { count: count.sleeved })}</span>
                )}
                {count.missing > 0 && (
                    <span className={"tabular-nums"}>{t("label.to-buy", { count: count.missing })}</span>
                )}
                {chevron != null && <span className={"ml-auto text-zinc-400 dark:text-zinc-500"}>{chevron}</span>}
            </p>
        </div>
    );
}
