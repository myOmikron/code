import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeckTagResponse } from "src/api/generated";
import { BarDistribution } from "src/components/charts/bar-distribution";
import { ChartCard, ChartPanel } from "src/components/charts/chart-card";
import { MAGIC_COLORS, seriesColor, TAG_CHART_COLORS } from "src/components/charts/colors";
import { FacetBars } from "src/components/charts/facet-bars";
import type { Facet } from "src/components/charts/facet-bars";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckTagMarker } from "src/components/deck-tag-marker";
import { ManaCost } from "src/components/mana-cost";
import { DECK_SPLITS } from "src/utils/deck-stats";
import type { DeckSplit, SplitChart } from "src/utils/deck-stats";
import { tagColor, TAG_COLOR_FALLBACK, TAG_ICON_FALLBACK } from "src/utils/deck-tags";
import type { Translate } from "src/utils/translate";

/**
 * The properties for {@link DeckSplitChart}
 */
export type DeckSplitChartProps = {
    /** The heading above the chart */
    title: string;
    /** A line explaining what is being counted */
    hint?: string;
    /** The bars, already counted for every split */
    chart: SplitChart;
    /** The tags that exist, for naming and colouring the tag facets */
    tags: Array<DeckTagResponse>;
    /** What a bar is labelled with, given the key it was counted under */
    labelOf: (key: string) => string;
    /** What a bar is called in words, for the tooltips; its label by default */
    nameOf?: (key: string) => string;
    /** How a count is said, e.g. `3 Karten` */
    countLabel: (count: number) => string;
    /** Whether the bars are colours and carry a pip instead of a name */
    pips?: boolean;
};

/**
 * A chart that can be broken up four ways.
 *
 * Undivided it is one chart. Cut by colour, card type or tag it becomes a small
 * chart per category, all on one scale, rather than one chart with the
 * categories stacked on top of each other: a stack only puts its bottom layer
 * on a common baseline, and every layer above it is then read against a floor
 * that moves from bar to bar.
 *
 * @returns the card holding the chart
 */
export function DeckSplitChart({
    title,
    hint,
    chart,
    tags,
    labelOf,
    nameOf,
    countLabel,
    pips = false,
}: DeckSplitChartProps) {
    const [t] = useTranslation("deck");
    const deckLabels = useDeckLabels();
    const [split, setSplit] = useState<DeckSplit>("all");

    // A cut into a single category is the undivided chart drawn a second time
    // under another name, so it is not offered at all.
    const offered = DECK_SPLITS.filter((option) => option === "all" || chart.segments[option].length > 1);
    const chosen = offered.includes(split) ? split : "all";

    const action = (
        <span
            className={
                "flex shrink-0 items-center rounded-(--radius-control) bg-zinc-950/5 p-0.5 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:ring-white/10"
            }
        >
            {offered.map((option) => (
                <button
                    key={option}
                    type={"button"}
                    aria-pressed={chosen === option}
                    onClick={() => setSplit(option)}
                    className={clsx(
                        "rounded-[calc(var(--radius-control)-0.125rem)] px-2 py-1 text-xs transition",
                        chosen === option
                            ? "bg-(--surface-card) text-zinc-950 shadow-(--shadow-card-sm) dark:text-white"
                            : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
                    )}
                >
                    {splitName(t, option)}
                </button>
            ))}
        </span>
    );

    if (chosen === "all") {
        return (
            <ChartCard title={title} hint={hint} action={action}>
                <BarDistribution
                    data={chart.bars.all.map((bar) => ({
                        label: labelOf(bar.key),
                        value: bar.segments.reduce((sum, segment) => sum + segment.cards, 0),
                        color: pips ? MAGIC_COLORS[bar.key] : undefined,
                        pip: pips ? bar.key : undefined,
                    }))}
                />
            </ChartCard>
        );
    }

    const facets: Array<Facet> = chart.segments[chosen].map((key, index) => ({
        ...facetOf(chosen, key, index, tags, t, deckLabels.color, deckLabels.type),
        bars: chart.bars[chosen].map((bar) => ({
            key: bar.key,
            cards: bar.segments.find((segment) => segment.key === key)?.cards ?? 0,
        })),
    }));

    return (
        <ChartPanel title={title} hint={hint} action={action} minHeight={260}>
            <FacetBars
                facets={facets}
                countLabel={countLabel}
                xName={nameOf ?? labelOf}
                barColor={pips ? (key) => MAGIC_COLORS[key] : undefined}
                xLabel={(key) =>
                    pips ? <ManaCost value={`{${key}}`} symbolClassName={"size-3"} /> : <span>{labelOf(key)}</span>
                }
            />
        </ChartPanel>
    );
}

/**
 * What a split is called
 *
 * Spelled out rather than assembled from the slug, as everywhere else the deck
 * pages name things: the translation scanner only reads keys written inside a
 * translate call.
 *
 * @param t the deck namespace's translate function
 * @param split how the chart is cut
 *
 * @returns its name
 */
function splitName(t: Translate, split: DeckSplit): string {
    switch (split) {
        case "all":
            return t("label.split-all");
        case "colors":
            return t("label.split-colors");
        case "types":
            return t("label.split-types");
        case "tags":
            return t("label.split-tags");
    }
}

/**
 * One category, named, coloured and marked
 *
 * @param split how the chart is cut
 * @param key the category, as it was counted
 * @param index where it sits, which picks a colour for the splits without a
 *        palette of their own
 * @param tags the tags that exist
 * @param t the deck namespace's translate function
 * @param colorName what a colour is called
 * @param typeName what a card type is called
 *
 * @returns the facet, without its bars
 */
function facetOf(
    split: DeckSplit,
    key: string,
    index: number,
    tags: Array<DeckTagResponse>,
    t: Translate,
    colorName: (key: string) => string,
    typeName: (key: string) => string,
): Omit<Facet, "bars"> {
    switch (split) {
        case "all":
            return { key, label: t("label.split-all"), color: seriesColor(0) };
        case "colors": {
            const color = MAGIC_COLORS[key] ?? seriesColor(index);
            return {
                key,
                label: colorName(key),
                color,
                icon:
                    MAGIC_COLORS[key] === undefined ? (
                        <Dot color={color} />
                    ) : (
                        <ManaCost value={`{${key}}`} symbolClassName={"size-3.5"} />
                    ),
            };
        }
        case "types":
            return { key, label: typeName(key), color: seriesColor(index), icon: <Dot color={seriesColor(index)} /> };
        case "tags": {
            const tag = tags.find((candidate) => candidate.uuid === key);
            const slug = tag === undefined ? TAG_COLOR_FALLBACK : tagColor(tag.color);
            return {
                key,
                label: tag?.name ?? t("label.untagged"),
                color: TAG_CHART_COLORS[slug] ?? seriesColor(index),
                icon: (
                    <DeckTagMarker
                        size={"sm"}
                        color={slug}
                        icon={tag?.icon ?? TAG_ICON_FALLBACK}
                        className={tag === undefined ? "opacity-60" : undefined}
                    />
                ),
            };
        }
    }
}

/**
 * The properties for {@link Dot}
 */
type DotProps = {
    /** What colour it is drawn in */
    color: string;
};

/**
 * The marker a facet gets when its category has no symbol of its own
 *
 * @returns the dot
 */
function Dot({ color }: DotProps) {
    return <span aria-hidden={true} className={"size-2 shrink-0 rounded-full"} style={{ backgroundColor: color }} />;
}
