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
 * Magic's five colours, mapped onto the same ramp.
 *
 * Deliberately not the colour pie: white and black are unusable as fills in one
 * theme or the other, and the three that remain would drag the page back into a
 * rainbow. The axis labels carry the colour names, so the bars only have to be
 * told apart, not identified.
 */
export const MAGIC_COLORS: Record<string, string> = {
    W: "#c7d2fe",
    U: "#6366f1",
    B: "#6d28d9",
    R: "#d946ef",
    G: "#a855f7",
    C: "#94a3b8",
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

/** Rarity, running from the palest step of the ramp to the most saturated */
export const RARITY_COLORS: Record<string, string> = {
    common: "#a5b4fc",
    uncommon: "#818cf8",
    rare: "#8b5cf6",
    mythic: "#c026d3",
    special: "#7c3aed",
    bonus: "#d946ef",
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
