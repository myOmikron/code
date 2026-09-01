import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";
import { useTranslation } from "react-i18next";
import { BucketReport } from "src/api/graph-generated";
import { DeckAdvisorCountCards } from "src/components/deck-advisor-count-cards";
import { TargetCorridor } from "src/components/target-corridor";
import { CardArt } from "src/utils/deck-art";
import { Corridor, MAX_CORRIDOR } from "src/utils/deck-targets";

/**
 * The properties for {@link DeckAdvisorQuotas}
 */
export type DeckAdvisorQuotasProps = {
    /** The composition buckets as the advisor reports them */
    buckets: Array<BucketReport>;
    /**
     * The corridors the builder set, by bucket id.
     *
     * Preferred over the report's own numbers while both exist, and that is
     * not redundancy: the report is fetched on a debounce, so a handle drawn
     * from it would sit still for half a second after every drag and read as
     * a broken control. The two agree as soon as the answer lands — the
     * service takes an override literally.
     */
    custom: Record<string, Corridor>;
    /** Moves one bucket's corridor */
    onSet: (bucket: string, corridor: Corridor) => void;
    /** Puts one bucket back on the bracket's own corridor */
    onReset: (bucket: string) => void;
    /** The deck's own artwork, for the cards behind each count */
    art: Map<string, CardArt>;
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
 * How well each composition role is covered, against a target the builder owns.
 *
 * The corridor is draggable and the bracket's own numbers are the *offer*: a
 * deck that runs eighteen pieces of interaction on purpose says so by moving
 * the handles, and the panel then grades it against that — as does every
 * suggestion, cut and fill, because the same numbers ride the request. A
 * moved corridor keeps the preset behind it as a dashed outline, so what was
 * offered is never lost behind what was chosen.
 *
 * The verdict is a phrase where there is something to do about it — "3 short"
 * says what to fix, where amber only said that something was wrong — and a
 * colour where there is not: a bar inside its corridor is green, and one past
 * it is the same green faded, since a deck that overshoots a role while
 * nothing else is short has made a choice rather than a mistake. Five rows
 * each carrying a line that read "On target" was most of this panel's height.
 *
 * @returns the meter list
 */
export function DeckAdvisorQuotas({ buckets, custom, onSet, onReset, art }: DeckAdvisorQuotasProps) {
    const [t] = useTranslation("advisor");
    // What makes an overshoot innocent: the slots it is spending are the ones
    // a short bucket wants back. With nothing short anywhere on the panel,
    // there is no one for it to be taking them from.
    const anyShort = buckets.some((bucket) => bucket.status === "low");

    return (
        <div className={"flex flex-col gap-4"}>
            {buckets.map((bucket) => {
                const preset = { low: bucket.default_low ?? bucket.low, high: bucket.default_high ?? bucket.high };
                const edited = custom[bucket.bucket];
                const corridor = edited ?? { low: bucket.low, high: bucket.high };
                // Headroom over the preset, the deck and the corridor in
                // force, so a bucket pushed past its preset still has track
                // ahead of it — held at the widest bound the service will
                // take, which is also the most cards a deck could spend on
                // one role. Without that ceiling a drag ran the corridor up
                // past it and every later request came back 422.
                const scale = Math.min(
                    MAX_CORRIDOR,
                    Math.ceil(Math.max(preset.high * 1.6, corridor.high * 1.1, bucket.coverage * 1.15, 6)),
                );
                const label = t(`label.bucket-${bucket.bucket.replace(/_/g, "-")}`, {
                    defaultValue: bucket.bucket.replace(/_/g, " "),
                });
                const verdict =
                    bucket.status === "ok"
                        ? t("label.quota-inside")
                        : bucket.status === "low"
                          ? t("label.quota-short", { amount: count(bucket.deviation) })
                          : t("label.quota-over", { amount: count(bucket.deviation) });
                const tone =
                    bucket.status === "ok" ? "inside" : bucket.status === "high" && !anyShort ? "over" : "missing";
                // Said out loud only where the colour is not the whole story.
                // The phrase still reaches a screen reader either way.
                const say = tone === "missing";

                return (
                    <div key={bucket.bucket} className={"group flex flex-col gap-2"}>
                        <div className={"flex items-baseline justify-between gap-x-3"}>
                            <span className={"truncate text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                                {label}
                            </span>
                            {/* The deck's number in the page's voice, the
                                target quietly behind it: one is a fact, the
                                other an intention, and reading them at the
                                same weight was most of what made this row
                                look like a spreadsheet cell. */}
                            <span className={"flex shrink-0 items-baseline gap-1.5 text-xs/5 tabular-nums"}>
                                <span className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                                    <DeckAdvisorCountCards
                                        count={count(bucket.coverage)}
                                        cards={bucket.cards ?? []}
                                        label={t("accessibility.counted-cards", { name: label })}
                                        art={art}
                                    />
                                </span>
                                <span className={"text-zinc-400 dark:text-zinc-500"}>
                                    {t("label.quota-target", {
                                        low: count(corridor.low),
                                        high: count(corridor.high),
                                    })}
                                </span>
                            </span>
                        </div>
                        <TargetCorridor
                            low={corridor.low}
                            high={corridor.high}
                            scale={scale}
                            coverage={bucket.coverage}
                            preset={edited === undefined ? undefined : preset}
                            tone={tone}
                            lowLabel={t("accessibility.quota-low", { name: label })}
                            highLabel={t("accessibility.quota-high", { name: label })}
                            valueText={(value) => t("label.quota-cards", { count: Math.round(value) })}
                            onChange={(moved) => onSet(bucket.bucket, moved)}
                        />
                        {!say && <span className={"sr-only"}>{verdict}</span>}
                        {/* One line under the meter carries both the verdict
                            and the way back — and is left out entirely where
                            it would carry neither, which is every row of a
                            deck that is doing fine. */}
                        {(say || edited !== undefined) && (
                            <div className={"-mt-0.5 flex h-5 items-center justify-between gap-3"}>
                                <span className={"truncate text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                    {say ? verdict : ""}
                                </span>
                                {edited !== undefined && (
                                    <button
                                        type={"button"}
                                        onClick={() => onReset(bucket.bucket)}
                                        aria-label={t("accessibility.quota-reset", { name: label })}
                                        className={
                                            "flex shrink-0 items-center gap-1 rounded-(--radius-pill) px-1.5 py-0.5 text-xs/5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-white"
                                        }
                                    >
                                        <ArrowUturnLeftIcon className={"size-3"} />
                                        {t("button.reset-one")}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
