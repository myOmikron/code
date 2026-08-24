import type React from "react";

/** One bar of a facet */
export type FacetBar = {
    /** What the bar stands for: a mana value, a colour */
    key: string;
    /** How high it goes */
    cards: number;
};

/** One of the small charts */
export type Facet = {
    /** What the facet counts */
    key: string;
    /** What it is called */
    label: string;
    /** The colour its bars are drawn in, unless a bar brings its own */
    color: string;
    /** A marker drawn before the name */
    icon?: React.ReactNode;
    /** The bars, in the order they should appear */
    bars: Array<FacetBar>;
};

/**
 * The properties for {@link FacetBars}
 */
export type FacetBarsProps = {
    /** The small charts, in the order they should appear */
    facets: Array<Facet>;
    /** What a bar is labelled with under the plot */
    xLabel: (key: string) => React.ReactNode;
    /** What a bar is called in words, for the tooltip and the screen reader */
    xName: (key: string) => string;
    /** How a count is said, e.g. `3 Karten` */
    countLabel: (count: number) => string;
    /** The colour of a bar, when the bars mean something on their own */
    barColor?: (key: string) => string | undefined;
};

/** How tall a facet's plot is, in pixels */
const PLOT_HEIGHT = 64;

/** How little of the plot a bar that holds something still fills */
const MIN_BAR = 2;

/**
 * The same chart once per category, all on one scale.
 *
 * What a stack cannot show: only its bottom layer stands on a common baseline,
 * so every layer above it is read against a moving floor and the shape of a
 * single tag's curve disappears. Given a small chart each, the shapes can be
 * compared directly, and the shared scale keeps the sizes honest, so a tag with
 * two cards stays visibly smaller than one with twelve.
 *
 * @returns the grid of charts
 */
export function FacetBars({ facets, xLabel, xName, countLabel, barColor }: FacetBarsProps) {
    const tallest = Math.max(1, ...facets.flatMap((facet) => facet.bars.map((bar) => bar.cards)));

    return (
        <div className={"grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3"}>
            {facets.map((facet) => {
                const total = facet.bars.reduce((sum, bar) => sum + bar.cards, 0);

                return (
                    <div key={facet.key} className={"flex min-w-0 flex-col gap-1.5"}>
                        <div className={"flex min-w-0 items-center gap-1.5"}>
                            {facet.icon}
                            <span className={"truncate text-xs font-medium text-zinc-950 dark:text-white"}>
                                {facet.label}
                            </span>
                            <span
                                className={"ml-auto shrink-0 text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400"}
                            >
                                {total}
                            </span>
                        </div>

                        <div
                            role={"img"}
                            aria-label={`${facet.label}: ${facet.bars
                                .map((bar) => `${xName(bar.key)} ${countLabel(bar.cards)}`)
                                .join(", ")}`}
                            className={"flex items-end gap-px border-b border-zinc-950/10 dark:border-white/10"}
                            style={{ height: PLOT_HEIGHT }}
                        >
                            {facet.bars.map((bar) => (
                                <div
                                    key={bar.key}
                                    aria-hidden={true}
                                    title={`${xName(bar.key)}: ${countLabel(bar.cards)}`}
                                    className={
                                        "flex h-full flex-1 flex-col justify-end rounded-t-sm bg-zinc-950/[0.03] dark:bg-white/[0.04]"
                                    }
                                >
                                    <div
                                        className={"w-full rounded-t-sm"}
                                        style={{
                                            height:
                                                bar.cards === 0
                                                    ? 0
                                                    : Math.max(MIN_BAR, (bar.cards / tallest) * PLOT_HEIGHT),
                                            backgroundColor: barColor?.(bar.key) ?? facet.color,
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        <div aria-hidden={true} className={"flex gap-px"}>
                            {facet.bars.map((bar) => (
                                <div
                                    key={bar.key}
                                    className={
                                        "flex min-w-0 flex-1 justify-center text-[10px] text-zinc-400 tabular-nums dark:text-zinc-500"
                                    }
                                >
                                    {xLabel(bar.key)}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
