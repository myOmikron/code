import { useTranslation } from "react-i18next";
import { CedhStats, LineEntry } from "src/api/graph-generated";
import { formatChance, formatExpected } from "src/utils/format";
import { openingHandOdds } from "src/utils/consistency";

/**
 * The properties for {@link DeckAdvisorConsistency}
 */
export type DeckAdvisorConsistencyProps = {
    /** The raw counts behind every chip — `Diagnostics.cedh_stats` */
    stats: CedhStats;
    /** The library size the draws are computed over — `Diagnostics.deck_size` */
    deckSize: number;
    /**
     * The report's complete lines, for the "tutor or line piece" chip's `K`.
     * `undefined` while `/lines` has not answered yet — the chip still reads
     * off `stats.tutor_count` alone rather than waiting on a second request.
     */
    completeLines: ReadonlyArray<LineEntry> | undefined;
};

/** One stat chip: a big number, its label, and the formula behind it on hover */
function Chip({ value, label, detail }: { value: string; label: string; detail: string }) {
    return (
        <div className={"bg-(--surface-card) p-4"} title={detail}>
            <p className={"text-xl font-semibold text-zinc-950 tabular-nums dark:text-white"}>{value}</p>
            <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>{label}</span>
        </div>
    );
}

/**
 * Four opening-hand facts a competitive pilot already works out by hand,
 * computed once here instead — Task D's hypergeometric math
 * (`src/utils/consistency.ts`) over Task C's raw counts (`cedh_stats`) and
 * the line report's own piece counts. No arithmetic is added in this file:
 * every number below is either read straight off `stats` or produced by
 * calling {@link openingHandOdds}.
 *
 * The grid is the app's own KPI-chip idiom (`deck-statistics.tsx`'s `Cell`
 * row) rather than a new one: a `gap-px` grid over one ring so the hairline
 * background shows through as dividers between cells.
 *
 * Per the mockup's refinement round, no formula is spelled out in the
 * layout — it rides the chip's `title`, the same hover-detail affordance the
 * rest of the advisor already uses for a corridor's raw `type_source`.
 *
 * @returns the four chips
 */
export function DeckAdvisorConsistency({ stats, deckSize, completeLines }: DeckAdvisorConsistencyProps) {
    const [t] = useTranslation("advisor");

    const fastMana = Math.round(stats.fast_mana_count);
    const tutors = Math.round(stats.tutor_count);
    const uniquePieces = new Set((completeLines ?? []).flatMap((line) => line.cards.map((card) => card.name))).size;
    const tutorOrLineCount = tutors + uniquePieces;

    const fastManaOdds = openingHandOdds(fastMana, deckSize).openingHand;
    const tutorOrLineOdds = openingHandOdds(tutorOrLineCount, deckSize).byTurn(3);

    return (
        <div
            className={
                "grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-card) bg-zinc-950/5 ring-1 ring-zinc-950/5 sm:grid-cols-4 dark:bg-white/10 dark:ring-white/10"
            }
        >
            <Chip
                value={stats.mean_mana_value === null ? "—" : formatExpected(stats.mean_mana_value)}
                label={t("label.consistency-mean-mv")}
                detail={t("label.consistency-mean-mv-detail")}
            />
            <Chip
                value={formatChance(fastManaOdds)}
                label={t("label.consistency-fast-mana")}
                detail={t("label.consistency-fast-mana-detail", { count: fastMana, deckSize })}
            />
            <Chip
                value={formatChance(tutorOrLineOdds)}
                label={t("label.consistency-tutor-or-line")}
                detail={t("label.consistency-tutor-or-line-detail", {
                    tutors,
                    pieces: uniquePieces,
                    total: tutorOrLineCount,
                })}
            />
            <Chip
                value={t("label.consistency-tapped-lands-value", {
                    tapped: Math.round(stats.tapped_land_count),
                    total: Math.round(stats.land_count),
                })}
                label={t("label.consistency-tapped-lands")}
                detail={t("label.consistency-tapped-lands-detail")}
            />
        </div>
    );
}
