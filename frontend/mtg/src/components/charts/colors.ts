/**
 * The palettes the collection charts draw with.
 *
 * One family, indigo through violet to fuchsia, rather than a categorical
 * rainbow: a dozen charts on one page each picking their own hues turns the
 * page into noise, and none of the splits shown here mean anything by colour.
 * Distance within the ramp is enough to tell neighbouring bars apart.
 *
 * Every value has to survive both themes — recharts paints into an svg, so a
 * fill is a fill and there is no dark-mode variant of it. That rules out both
 * ends of the scale: nothing near white, nothing near black.
 */

/**
 * Magic's five colours, as themselves.
 *
 * These charts are labelled with the pips themselves, so the fills have to
 * agree with them — a bar marked with the white pip may not be violet. The values
 * are the colour pie pulled toward the middle of the lightness range: printed
 * white is too pale to see on a light card and printed black too dark to see on
 * a dark one, so white becomes a warm sand and black a slate. Blue, red and
 * green sit close to their printed hue.
 */
export const MAGIC_COLORS: Record<string, string> = {
    W: "#cbbc7a",
    U: "#3b82f6",
    B: "#6b6478",
    R: "#e2564b",
    G: "#3faa6d",
    C: "#9aa4b2",
    multicolor: "#c8a02c",
    colorless: "#9aa4b2",
};

/** Categorical palette, ordered so that neighbours stay distinguishable */
export const SERIES_COLORS = [
    "#6366f1",
    "#a855f7",
    "#818cf8",
    "#d946ef",
    "#7c3aed",
    "#c026d3",
    "#4f46e5",
    "#e879f9",
    "#8b5cf6",
    "#9333ea",
];

/**
 * Rarity in the colours its set symbol is printed in.
 *
 * Black, silver, gold, red-gold — the order a player already reads without a
 * legend. Common is a slate rather than true black and uncommon a warm silver
 * rather than a flat grey, for the same reason the colour pie is pulled inward:
 * the extremes disappear into one of the two card surfaces.
 *
 * Special and bonus keep a hue of their own; their symbols have no established
 * metal, and putting them near gold would only blur the four that do.
 */
export const RARITY_COLORS: Record<string, string> = {
    common: "#5b6169",
    uncommon: "#a3adba",
    rare: "#c8a02c",
    mythic: "#d4472a",
    special: "#8b5cf6",
    bonus: "#c026d3",
};

/**
 * Picks a colour from the categorical palette, wrapping around
 *
 * @param index position in the series
 *
 * @returns a hex colour
 */
export function seriesColor(index: number): string {
    return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0]!;
}

/**
 * The tag palette, as the markers are printed.
 *
 * A tag carries its colour everywhere it is drawn: the marker on a card, the
 * chip in the dock. A chart split by tags has to use the same one, or the
 * legend is the only thing tying a bar to the tag it counts. These are the
 * Tailwind 500 shades the markers use, written out because an svg fill cannot
 * be a class name.
 */
export const TAG_CHART_COLORS: Record<string, string> = {
    zinc: "#71717a",
    red: "#ef4444",
    orange: "#f97316",
    amber: "#f59e0b",
    lime: "#84cc16",
    emerald: "#10b981",
    teal: "#14b8a6",
    cyan: "#06b6d4",
    blue: "#3b82f6",
    indigo: "#6366f1",
    violet: "#8b5cf6",
    fuchsia: "#d946ef",
    pink: "#ec4899",
};
