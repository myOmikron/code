import clsx from "clsx";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link FillCoverage}
 */
export type FillCoverageProps = {
    /** Coverage after the fill, by bucket */
    coverage?: { [key: string]: number | undefined };
    /** Coverage the deck already had, by bucket */
    base?: { [key: string]: number | undefined };
    /** The corridor each bucket was solved to, as [low, high] */
    targets?: { [key: string]: Array<number> | undefined };
};

/**
 * Formats a weighted count without a pointless `.0`
 *
 * @param value the count, possibly fractional
 *
 * @returns the count with at most one decimal
 */
function count(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * How the fill moved every bucket it solved to, one meter per bucket.
 *
 * The solve already knows this — `base_coverage` before, `coverage` after,
 * `targets` the corridor it aimed at — and until now the dialog said none of
 * it, only prose ("ramp was already over target…") that repeated the quotas
 * panel in words instead of showing the shape it draws there. This is that
 * shape, compacted to the one thing a fill dialog needs: did the bucket move,
 * and does it sit inside the band now.
 *
 * Each row scales to its own corridor rather than a shared axis — mana
 * sources sit around 36, ramp around 14, and a shared scale would flatten one
 * of them to a hairline.
 *
 * @returns the meter list, or nothing when the solve reports no usable targets
 */
export function FillCoverage({ coverage, base, targets }: FillCoverageProps) {
    const [t] = useTranslation("advisor");
    const entries = Object.entries(targets ?? {}).filter(
        (entry): entry is [string, [number, number]] => Array.isArray(entry[1]) && entry[1].length === 2,
    );
    if (entries.length === 0) return null;

    return (
        <div className={"grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5"}>
            {entries.map(([bucket, [low, high]]) => {
                const before = base?.[bucket] ?? 0;
                const after = coverage?.[bucket] ?? before;
                const over = after > high + 0.05;
                const label = t(`label.bucket-${bucket.replace(/_/g, "-")}`, {
                    defaultValue: bucket.replace(/_/g, " "),
                });
                // The `|| 1` keeps an all-zero row from dividing by zero.
                const scaleMax = Math.max(high, after, before) * 1.15 || 1;
                const percent = (value: number) => `${(value / scaleMax) * 100}%`;
                const statement = t("accessibility.fill-coverage", {
                    bucket: label,
                    before: count(before),
                    after: count(after),
                    low: count(low),
                    high: count(high),
                });

                return (
                    <div key={bucket} className={"col-span-3 grid grid-cols-subgrid items-center"} title={statement}>
                        {/* The visible label and numbers already say most of
                            this; the sentence below fills the gap they leave —
                            the track itself, which the sighted reading skips
                            straight over. */}
                        <span className={"sr-only"}>{statement}</span>
                        <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>{label}</span>
                        <span
                            className={
                                "relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"
                            }
                            aria-hidden={true}
                        >
                            {/* The corridor the fill was solved to. */}
                            <span
                                className={"absolute inset-y-0 rounded-full bg-zinc-950/15 dark:bg-white/20"}
                                style={{ left: percent(low), width: `calc(${percent(high)} - ${percent(low)})` }}
                            />
                            <span
                                className={clsx(
                                    "absolute inset-y-0 left-0 rounded-full",
                                    over ? "bg-amber-500" : "bg-zinc-500 dark:bg-zinc-400",
                                )}
                                style={{ width: percent(after) }}
                            />
                            {/* Where the bucket stood before this fill, drawn
                                over the bar so it stays visible where the fill
                                would otherwise bury it. Skipped when the fill
                                left the bucket untouched — nothing moved, so
                                there is nothing for the tick to mark. */}
                            {before !== after && (
                                <span
                                    className={"absolute inset-y-0 w-px bg-zinc-950/40 dark:bg-white/40"}
                                    style={{ left: percent(before) }}
                                />
                            )}
                        </span>
                        <span className={"shrink-0 text-right text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>
                            {count(before)} →{" "}
                            <span className={over ? "text-amber-700 dark:text-amber-300" : undefined}>
                                {count(after)}
                            </span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
