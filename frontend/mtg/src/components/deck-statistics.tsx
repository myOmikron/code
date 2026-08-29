import { Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import type { DeckTagResponse } from "src/api/generated";
import { BarDistribution } from "src/components/charts/bar-distribution";
import { ChartCard } from "src/components/charts/chart-card";
import { RARITY_COLORS, seriesColor } from "src/components/charts/colors";
import { SharePie } from "src/components/charts/share-pie";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckManaSources } from "src/components/deck-mana-sources";
import { DeckOddsPanel } from "src/components/deck-odds";
import { DeckSplitChart } from "src/components/deck-split-chart";
import { DeckTagStatistics } from "src/components/deck-tag-statistics";
import type { DeckOdds } from "src/utils/deck-odds";
import type { DeckStats } from "src/utils/deck-stats";
import { MANA_CURVE_CAP } from "src/utils/deck-stats";
import { formatCurrency } from "src/utils/format";

/** The rarities in the order they climb */
const RARITY_ORDER = ["common", "uncommon", "rare", "mythic", "special", "bonus"];

/**
 * The properties for {@link DeckStatistics}
 */
export type DeckStatisticsProps = {
    /** The deck these numbers belong to */
    deckId: string;
    /** Everything already counted */
    stats: DeckStats;
    /** What the deck is likely to do */
    odds: DeckOdds;
    /** The tags that exist, for the splits and the breakdown by tag */
    tags: Array<DeckTagResponse>;
};

/**
 * What a deck is made of: the headline numbers and four charts.
 *
 * Counted in the client from the card list the page already holds, so the
 * numbers move while the deck is being built.
 *
 * @returns the statistics
 */
export function DeckStatistics({ deckId, stats, odds, tags }: DeckStatisticsProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    return (
        <div className={"flex flex-col gap-6"}>
            <div
                className={
                    "grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-card) bg-zinc-950/5 ring-1 ring-zinc-950/5 sm:grid-cols-4 dark:bg-white/10 dark:ring-white/10"
                }
            >
                <Cell label={t("label.total-cards")} value={stats.totalCards} />
                <Cell label={t("label.lands")} value={stats.lands} />
                <Cell label={t("label.average-mana-value")} value={stats.averageManaValue.toFixed(2)} />
                <Cell
                    label={t("label.deck-value")}
                    value={formatCurrency(stats.marketValue)}
                    sub={
                        stats.pricedCards < stats.totalCards
                            ? t("label.priced-cards", { amount: stats.pricedCards })
                            : undefined
                    }
                />
            </div>

            <DeckOddsPanel deckId={deckId} odds={odds} tags={tags} />

            <DeckManaSources pips={stats.pips} sources={stats.manaSources} />

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <DeckSplitChart
                    title={t("heading.mana-curve")}
                    hint={t("description.mana-curve")}
                    chart={stats.manaCurveSplit}
                    tags={tags}
                    countLabel={(count) => t("label.cards-count", { count })}
                    labelOf={(key) => (key === String(MANA_CURVE_CAP) ? `${key}+` : key)}
                    nameOf={(key) =>
                        key === String(MANA_CURVE_CAP)
                            ? t("label.mana-value-cap", { value: key })
                            : t("label.mana-value", { value: key })
                    }
                />

                <DeckSplitChart
                    title={t("heading.pips")}
                    hint={t("description.pips")}
                    chart={stats.pipsSplit}
                    tags={tags}
                    pips={true}
                    countLabel={(count) => t("label.pips-count", { count })}
                    labelOf={(key) => labels.color(key)}
                />

                <ChartCard title={t("heading.types")}>
                    <BarDistribution
                        layout={"rows"}
                        data={stats.types.map((bucket, index) => ({
                            label: labels.type(bucket.key),
                            value: bucket.cards,
                            color: seriesColor(index),
                        }))}
                        showValues={true}
                    />
                </ChartCard>

                <ChartCard title={t("heading.rarity")}>
                    <SharePie
                        arc={true}
                        data={[...stats.rarities]
                            .sort((left, right) => rank(left.key) - rank(right.key))
                            .map((bucket) => ({
                                label: bucket.key,
                                value: bucket.cards,
                                color: RARITY_COLORS[bucket.key],
                            }))}
                    />
                </ChartCard>
            </div>

            <DeckTagStatistics stats={stats.tagStats} tags={tags} totalCards={stats.totalCards} />

            {stats.topCards.length > 0 && (
                <div
                    className={
                        "rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
                    }
                >
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>
                        {t("heading.most-valuable")}
                    </h3>
                    <ul className={"mt-4 flex flex-col gap-3"}>
                        {stats.topCards.map((card) => (
                            <li key={card.uuid} className={"flex items-center gap-3"}>
                                {card.imageUrl !== null && (
                                    <img
                                        src={card.imageUrl}
                                        crossOrigin={"anonymous"}
                                        alt={card.name}
                                        loading={"lazy"}
                                        className={
                                            "aspect-5/7 h-12 w-auto shrink-0 rounded bg-zinc-200 object-cover dark:bg-zinc-700"
                                        }
                                    />
                                )}
                                <div className={"flex min-w-0 flex-1 flex-col"}>
                                    <Strong className={"truncate"}>{card.name}</Strong>
                                    <Text className={"text-xs"}>{`×${card.copies}`}</Text>
                                </div>
                                <Strong className={"shrink-0 tabular-nums"}>{formatCurrency(card.value)}</Strong>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/**
 * The properties for {@link Cell}
 */
type CellProps = {
    /** What the number is */
    label: string;
    /** The number */
    value: string | number;
    /** An aside shown under the value */
    sub?: string;
};

/**
 * One compartment of the strip above the charts
 *
 * @returns the compartment
 */
function Cell({ label, value, sub }: CellProps) {
    return (
        <div className={"bg-(--surface-card) p-4"}>
            <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>{label}</span>
            <p className={"mt-1.5 text-xl font-semibold text-zinc-950 tabular-nums dark:text-white"}>{value}</p>
            {sub !== undefined && <p className={"mt-0.5 text-xs text-zinc-500 dark:text-zinc-400"}>{sub}</p>}
        </div>
    );
}

/**
 * Where a rarity sits on the ladder
 *
 * @param rarity Scryfall's spelling of it
 *
 * @returns its position, anything unknown at the end
 */
function rank(rarity: string): number {
    const index = RARITY_ORDER.indexOf(rarity);
    return index === -1 ? RARITY_ORDER.length : index;
}
