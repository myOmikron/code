/**
 * The marker a collection wears: a colour and a pictogram.
 *
 * A collection is recognised by its lid long before its label is read, so a
 * collection carries the same two things a deck tag does. Both are stored as
 * slugs, and a slug has to survive a round trip through a database column any
 * client may have written: what comes back is normalised here, and the
 * palettes that are offered live here too.
 */

/** The colours a collection can be drawn in, in the order they are offered */
export const COLLECTION_COLORS = [
    "zinc",
    "red",
    "orange",
    "amber",
    "lime",
    "emerald",
    "teal",
    "cyan",
    "blue",
    "indigo",
    "violet",
    "fuchsia",
    "pink",
] as const;

/** One of the colours a collection can be drawn in */
export type CollectionColor = (typeof COLLECTION_COLORS)[number];

/** The colour a collection falls back to */
export const COLLECTION_COLOR_FALLBACK: CollectionColor = "zinc";

/** The pictograms a collection can carry, in the order they are offered */
export const COLLECTION_ICONS = [
    "box",
    "binder",
    "shelf",
    "deckbox",
    "cards",
    "sealed",
    "bulk",
    "trade",
    "money",
    "vault",
    "star",
    "sparkles",
    "trophy",
    "heart",
    "fire",
    "bolt",
    "land",
    "token",
    "tag",
    "home",
    "eye",
] as const;

/** One of the pictograms a collection can carry */
export type CollectionIconName = (typeof COLLECTION_ICONS)[number];

/** The pictogram a collection falls back to */
export const COLLECTION_ICON_FALLBACK: CollectionIconName = "box";

/**
 * The flat colour a collection is filled with
 *
 * Spelled out rather than built from the slug: Tailwind reads the class names
 * out of the source, and one assembled at runtime is never generated.
 */
export const COLLECTION_FILL: Record<CollectionColor, string> = {
    zinc: "bg-zinc-500",
    red: "bg-red-500",
    orange: "bg-orange-500",
    amber: "bg-amber-500",
    lime: "bg-lime-500",
    emerald: "bg-emerald-500",
    teal: "bg-teal-500",
    cyan: "bg-cyan-500",
    blue: "bg-blue-500",
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    fuchsia: "bg-fuchsia-500",
    pink: "bg-pink-500",
};

/**
 * Reads back a stored colour slug
 *
 * @param value whatever the database handed over
 *
 * @returns the colour, or the fallback for anything unknown
 */
export function collectionColor(value: string): CollectionColor {
    return COLLECTION_COLORS.find((color) => color === value) ?? COLLECTION_COLOR_FALLBACK;
}

/**
 * Reads back a stored icon slug
 *
 * @param value whatever the database handed over
 *
 * @returns the pictogram, or the fallback for anything unknown
 */
export function collectionIcon(value: string): CollectionIconName {
    return COLLECTION_ICONS.find((icon) => icon === value) ?? COLLECTION_ICON_FALLBACK;
}
