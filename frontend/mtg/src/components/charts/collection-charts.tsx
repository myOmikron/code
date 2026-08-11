import { useTranslation } from "react-i18next";
import type { CollectionStats } from "src/utils/collection-stats";
import { MANA_CURVE_CAP } from "src/utils/collection-stats";
import { formatCurrencyCompact, formatMonth } from "src/utils/format";
import { ChartCard } from "src/components/charts/chart-card";
import { BarDistribution } from "src/components/charts/bar-distribution";
import { SharePie } from "src/components/charts/share-pie";
import { ColorRadar } from "src/components/charts/color-radar";
import { CollectionTimeline } from "src/components/charts/collection-timeline";
import { PriceScatter } from "src/components/charts/price-scatter";
import { MAGIC_COLORS, RARITY_COLORS, seriesColor } from "src/components/charts/colors";

/**
 * Translation keys for everything the statistics derive as a bare slug.
 *
 * Spelled out rather than composed, because the scanner only ever sees literal
 * `t()` arguments and would drop a key built from a variable.
 */
const TYPE_KEY: Record<string, string> = {
    land: "label.type-land",
    creature: "label.type-creature",
    planeswalker: "label.type-planeswalker",
    battle: "label.type-battle",
    instant: "label.type-instant",
    sorcery: "label.type-sorcery",
    enchantment: "label.type-enchantment",
    artifact: "label.type-artifact",
    conspiracy: "label.type-conspiracy",
    dungeon: "label.type-dungeon",
    phenomenon: "label.type-phenomenon",
    plane: "label.type-plane",
    scheme: "label.type-scheme",
    vanguard: "label.type-vanguard",
    other: "label.type-other",
};

/**
 * The rarities in the order they climb, which is the order they are shown in.
 *
 * `special` and `bonus` bring up the rear: they are not a step on the ladder
 * but their own thing — timeshifted sheets, bonus sheets — and putting them
 * among the four would break the reading of the ramp.
 */
const RARITY_ORDER = ["common", "uncommon", "rare", "mythic", "special", "bonus"];

/**
 * Where a rarity sits on the ladder
 *
 * @param rarity Scryfall's spelling of it
 *
 * @returns its position, with anything unrecognised sorted to the end
 */
function rarityRank(rarity: string): number {
    const rank = RARITY_ORDER.indexOf(rarity);
    return rank === -1 ? RARITY_ORDER.length : rank;
}

/** Translation key per rarity, see {@link TYPE_KEY} */
const RARITY_KEY: Record<string, string> = {
    mythic: "label.rarity-mythic",
    rare: "label.rarity-rare",
    uncommon: "label.rarity-uncommon",
    common: "label.rarity-common",
    special: "label.rarity-special",
    bonus: "label.rarity-bonus",
};

/** Translation key per colour letter, see {@link TYPE_KEY} */
const COLOR_KEY: Record<string, string> = {
    W: "label.color-white",
    U: "label.color-blue",
    B: "label.color-black",
    R: "label.color-red",
    G: "label.color-green",
};

/** Translation key per number of colours on a card, see {@link TYPE_KEY} */
const SPREAD_KEY: Record<string, string> = {
    "0": "label.colors-none",
    "1": "label.colors-one",
    "2": "label.colors-two",
    "3": "label.colors-three",
    "4": "label.colors-four",
    "5": "label.colors-five",
};

/** Translation key per price bracket, see {@link TYPE_KEY} */
const VALUE_KEY: Record<string, string> = {
    bulk: "label.value-bulk",
    low: "label.value-low",
    mid: "label.value-mid",
    high: "label.value-high",
    premium: "label.value-premium",
    chase: "label.value-chase",
};

/** Translation key per format, see {@link TYPE_KEY} */
const FORMAT_KEY: Record<string, string> = {
    standard: "label.format-standard",
    pioneer: "label.format-pioneer",
    modern: "label.format-modern",
    legacy: "label.format-legacy",
    vintage: "label.format-vintage",
    commander: "label.format-commander",
    pauper: "label.format-pauper",
};

/**
 * The properties for {@link CollectionCharts}
 */
export type CollectionChartsProps = {
    /** Everything already counted */
    stats: CollectionStats;
};

/**
 * Every chart of the statistics tab, in one module on purpose.
 *
 * This is the only place that pulls in recharts, and recharts is by far the
 * heaviest thing the app ships. Keeping it behind a single import boundary is
 * what lets the statistics page paint its numbers immediately and stream the
 * drawings in afterwards, instead of waiting on a third of a megabyte before
 * showing anything at all.
 *
 * @returns the charts
 */
export function CollectionCharts({ stats }: CollectionChartsProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    /**
     * Renders a copy count for a tooltip
     *
     * @param value the count
     *
     * @returns the localised text
     */
    const cards = (value: number) => tg("label.cards", { count: value, amount: value });

    return (
        <>
            <div className={"grid gap-6 lg:grid-cols-2"}>
                <ChartCard title={t("heading.mana-curve")} hint={t("description.mana-curve")}>
                    <BarDistribution
                        data={stats.manaCurve.map((bucket) => ({
                            label: bucket.key === String(MANA_CURVE_CAP) ? `${MANA_CURVE_CAP}+` : bucket.key,
                            value: bucket.cards,
                        }))}
                        format={cards}
                    />
                </ChartCard>
                <ChartCard title={t("heading.color-identity")} hint={t("description.color-identity")}>
                    <ColorRadar
                        data={stats.colorIdentity.map((bucket) => ({
                            label: t(COLOR_KEY[bucket.key] ?? bucket.key),
                            value: bucket.cards,
                            // The bucket key already is the pip Scryfall
                            // serves — `W`, `U`, `B`, `R`, `G`.
                            pip: COLOR_KEY[bucket.key] !== undefined ? bucket.key : undefined,
                        }))}
                        format={cards}
                    />
                </ChartCard>
            </div>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <ChartCard title={t("heading.pips")} hint={t("description.pips")}>
                    <BarDistribution
                        data={stats.pips.map((bucket) => ({
                            label: t(COLOR_KEY[bucket.key] ?? bucket.key),
                            value: bucket.cards,
                            color: MAGIC_COLORS[bucket.key],
                            pip: COLOR_KEY[bucket.key] !== undefined ? bucket.key : undefined,
                        }))}
                    />
                </ChartCard>
                <ChartCard title={t("heading.color-spread")} hint={t("description.color-spread")}>
                    <BarDistribution
                        data={stats.colorSpread.map((bucket, index) => ({
                            label: t(SPREAD_KEY[bucket.key] ?? bucket.key),
                            value: bucket.cards,
                            color: index === 0 ? MAGIC_COLORS.C : seriesColor(index),
                        }))}
                        format={cards}
                    />
                </ChartCard>
            </div>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <ChartCard title={t("heading.types")}>
                    {/* Rows rather than a donut: Magic has a dozen card types,
                        and a ring of a dozen slices is a colour wheel with a
                        legend to look things up in. Bars put the names next to
                        the lengths and stay readable however many there are.
                        Sorted by size, since the question here is what the
                        collection is mostly made of. */}
                    <BarDistribution
                        layout={"rows"}
                        data={stats.types
                            .filter((bucket) => bucket.cards > 0)
                            .sort((left, right) => right.cards - left.cards)
                            .map((bucket, index) => ({
                                label: t(TYPE_KEY[bucket.key] ?? bucket.key),
                                value: bucket.cards,
                                color: seriesColor(index),
                            }))}
                        format={cards}
                        showValues={true}
                    />
                </ChartCard>
                <ChartCard title={t("heading.rarity")}>
                    <SharePie
                        // Ordered by rarity, not by how many there are: the
                        // whole point of the split is the climb from common to
                        // mythic, and sorting it by size would scramble that.
                        data={[...stats.rarities]
                            .sort((left, right) => rarityRank(left.key) - rarityRank(right.key))
                            .map((bucket) => ({
                                label: RARITY_KEY[bucket.key] !== undefined ? t(RARITY_KEY[bucket.key]) : bucket.key,
                                value: bucket.cards,
                                color: RARITY_COLORS[bucket.key],
                            }))}
                        format={cards}
                        arc={true}
                    />
                </ChartCard>
            </div>

            <ChartCard title={t("heading.timeline")} hint={t("description.timeline")} height={300}>
                <CollectionTimeline
                    data={stats.timeline}
                    cardsName={t("label.total-cards")}
                    valueName={t("label.market-value")}
                    formatMonth={formatMonth}
                    formatValue={formatCurrencyCompact}
                />
            </ChartCard>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <ChartCard title={t("heading.value-distribution")} hint={t("description.value-distribution")}>
                    <BarDistribution
                        data={stats.valueBuckets.map((bucket, index) => ({
                            label: t(VALUE_KEY[bucket.key] ?? bucket.key),
                            value: bucket.cards,
                            color: seriesColor(index + 2),
                        }))}
                        format={cards}
                    />
                </ChartCard>
                {stats.pricePoints.length > 0 && (
                    <ChartCard title={t("heading.purchase-vs-market")} hint={t("description.purchase-vs-market")}>
                        <PriceScatter
                            data={stats.pricePoints}
                            purchaseName={t("label.purchase-price")}
                            marketName={t("label.market-value")}
                            formatValue={formatCurrencyCompact}
                        />
                    </ChartCard>
                )}
            </div>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <ChartCard title={t("heading.years")} hint={t("description.years")}>
                    <BarDistribution
                        data={stats.years.map((bucket) => ({ label: bucket.key, value: bucket.cards }))}
                        color={"#818cf8"}
                        format={cards}
                    />
                </ChartCard>
                <ChartCard title={t("heading.sets")}>
                    <BarDistribution
                        data={stats.sets.map((bucket) => ({ label: bucket.key, value: bucket.cards }))}
                        layout={"rows"}
                        labelWidth={56}
                        showValues={true}
                        color={"#8b5cf6"}
                        format={cards}
                    />
                </ChartCard>
            </div>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <ChartCard title={t("heading.formats")} hint={t("description.formats")}>
                    <BarDistribution
                        data={stats.formats.map((bucket) => ({
                            label: t(FORMAT_KEY[bucket.key] ?? bucket.key),
                            value: bucket.cards,
                        }))}
                        layout={"rows"}
                        labelWidth={96}
                        showValues={true}
                        color={"#a855f7"}
                        format={cards}
                    />
                </ChartCard>
                <ChartCard title={t("heading.artists")} hint={t("description.artists")}>
                    <BarDistribution
                        data={stats.artists.map((bucket) => ({ label: bucket.key, value: bucket.cards }))}
                        layout={"rows"}
                        labelWidth={130}
                        color={"#c026d3"}
                        format={cards}
                    />
                </ChartCard>
            </div>

            {stats.keywords.length > 0 && (
                <ChartCard title={t("heading.keywords")} hint={t("description.keywords")}>
                    <BarDistribution
                        data={stats.keywords.map((bucket) => ({ label: bucket.key, value: bucket.cards }))}
                        layout={"rows"}
                        labelWidth={140}
                        color={"#d946ef"}
                        format={cards}
                    />
                </ChartCard>
            )}
        </>
    );
}
