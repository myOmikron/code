import { useTranslation } from "react-i18next";
import type { CollectionStats } from "src/utils/collection-stats";
import { MANA_CURVE_CAP } from "src/utils/collection-stats";
import { formatCurrencyCompact, formatMonth } from "src/utils/format";
import { ChartCard } from "src/components/charts/chart-card";
import { BarDistribution } from "src/components/charts/bar-distribution";
import { SharePie } from "src/components/charts/share-pie";
import { ProfileRadar } from "src/components/charts/profile-radar";
import { CollectionTimeline } from "src/components/charts/collection-timeline";
import { PriceScatter } from "src/components/charts/price-scatter";
import { MAGIC_COLORS, RARITY_COLORS, seriesColor } from "src/components/charts/colors";
import type { Translate } from "src/utils/translate";

/**
 * What the buckets the statistics derive are called.
 *
 * Written as calls rather than as tables of key strings: the translation
 * scanner only ever reads keys spelled out inside a translate call, and one
 * reached through a variable is dropped as unused on its next sweep.
 * Every one of them falls back to the bare slug, which is what the server sends
 * for anything these do not know.
 *
 * @param t the collection namespace's translate function
 * @param key the slug the statistics bucketed under
 *
 * @returns the label
 */
function typeLabel(t: Translate, key: string): string {
    switch (key) {
        case "land":
            return t("label.type-land");
        case "creature":
            return t("label.type-creature");
        case "planeswalker":
            return t("label.type-planeswalker");
        case "battle":
            return t("label.type-battle");
        case "instant":
            return t("label.type-instant");
        case "sorcery":
            return t("label.type-sorcery");
        case "enchantment":
            return t("label.type-enchantment");
        case "artifact":
            return t("label.type-artifact");
        case "conspiracy":
            return t("label.type-conspiracy");
        case "dungeon":
            return t("label.type-dungeon");
        case "phenomenon":
            return t("label.type-phenomenon");
        case "plane":
            return t("label.type-plane");
        case "scheme":
            return t("label.type-scheme");
        case "vanguard":
            return t("label.type-vanguard");
        case "other":
            return t("label.type-other");
        default:
            return key;
    }
}

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

/**
 * What a rarity is called, see {@link typeLabel}
 *
 * Scryfall spells them lower case here, unlike the api's own enum, so this is
 * not the same mapping the card views use.
 *
 * @param t the collection namespace's translate function
 * @param key the slug the statistics bucketed under
 *
 * @returns the label
 */
function rarityLabel(t: Translate, key: string): string {
    switch (key) {
        case "mythic":
            return t("label.rarity-mythic");
        case "rare":
            return t("label.rarity-rare");
        case "uncommon":
            return t("label.rarity-uncommon");
        case "common":
            return t("label.rarity-common");
        case "special":
            return t("label.rarity-special");
        case "bonus":
            return t("label.rarity-bonus");
        default:
            return key;
    }
}

/**
 * Whether a slug is one of the five colours, which decides if it gets a pip
 *
 * @param key the slug the statistics bucketed under
 *
 * @returns whether it names a colour
 */
function isColor(key: string): boolean {
    return ["W", "U", "B", "R", "G"].includes(key);
}

/**
 * What a colour is called, see {@link typeLabel}
 *
 * @param t the collection namespace's translate function
 * @param key the slug the statistics bucketed under
 *
 * @returns the label
 */
function colorLabel(t: Translate, key: string): string {
    switch (key) {
        case "W":
            return t("label.color-white");
        case "U":
            return t("label.color-blue");
        case "B":
            return t("label.color-black");
        case "R":
            return t("label.color-red");
        case "G":
            return t("label.color-green");
        default:
            return key;
    }
}

/**
 * What a number of colours on a card is called, see {@link typeLabel}
 *
 * @param t the collection namespace's translate function
 * @param key the slug the statistics bucketed under
 *
 * @returns the label
 */
function spreadLabel(t: Translate, key: string): string {
    switch (key) {
        case "0":
            return t("label.colors-none");
        case "1":
            return t("label.colors-one");
        case "2":
            return t("label.colors-two");
        case "3":
            return t("label.colors-three");
        case "4":
            return t("label.colors-four");
        case "5":
            return t("label.colors-five");
        default:
            return key;
    }
}

/**
 * What a price bracket is called, see {@link typeLabel}
 *
 * @param t the collection namespace's translate function
 * @param key the slug the statistics bucketed under
 *
 * @returns the label
 */
function valueLabel(t: Translate, key: string): string {
    switch (key) {
        case "bulk":
            return t("label.value-bulk");
        case "low":
            return t("label.value-low");
        case "mid":
            return t("label.value-mid");
        case "high":
            return t("label.value-high");
        case "premium":
            return t("label.value-premium");
        case "chase":
            return t("label.value-chase");
        default:
            return key;
    }
}

/**
 * What a format is called, see {@link typeLabel}
 *
 * @param t the collection namespace's translate function
 * @param key the slug the statistics bucketed under
 *
 * @returns the label
 */
function formatLabel(t: Translate, key: string): string {
    switch (key) {
        case "standard":
            return t("label.format-standard");
        case "pioneer":
            return t("label.format-pioneer");
        case "modern":
            return t("label.format-modern");
        case "legacy":
            return t("label.format-legacy");
        case "vintage":
            return t("label.format-vintage");
        case "commander":
            return t("label.format-commander");
        case "pauper":
            return t("label.format-pauper");
        default:
            return key;
    }
}

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
                    <ProfileRadar
                        data={stats.colorIdentity.map((bucket) => ({
                            label: colorLabel(t, bucket.key),
                            value: bucket.cards,
                            // The bucket key already is the pip Scryfall
                            // serves — `W`, `U`, `B`, `R`, `G`.
                            pip: isColor(bucket.key) ? bucket.key : undefined,
                        }))}
                        format={cards}
                    />
                </ChartCard>
            </div>

            <div className={"grid gap-6 lg:grid-cols-2"}>
                <ChartCard title={t("heading.pips")} hint={t("description.pips")}>
                    <BarDistribution
                        data={stats.pips.map((bucket) => ({
                            label: colorLabel(t, bucket.key),
                            value: bucket.cards,
                            color: MAGIC_COLORS[bucket.key],
                            pip: isColor(bucket.key) ? bucket.key : undefined,
                        }))}
                    />
                </ChartCard>
                <ChartCard title={t("heading.color-spread")} hint={t("description.color-spread")}>
                    <BarDistribution
                        data={stats.colorSpread.map((bucket, index) => ({
                            label: spreadLabel(t, bucket.key),
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
                                label: typeLabel(t, bucket.key),
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
                                label: rarityLabel(t, bucket.key),
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
                            label: valueLabel(t, bucket.key),
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
                            label: formatLabel(t, bucket.key),
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
