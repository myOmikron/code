/**
 * How a format picker lists the formats: the commonly played ones first, the
 * rest after them, each group in alphabetical order of its names.
 */

/** The group a format is listed under */
export type FormatGroup = "popular" | "rare";

/**
 * The formats most Tournaments are played in, listed before every other
 *
 * A judgement, not a measurement: the sanctioned constructed formats, both
 * Limited formats and the two Commander formats with a tournament scene.
 */
export const POPULAR_FORMATS: ReadonlyArray<string> = [
    "commander",
    "draft",
    "duel",
    "legacy",
    "modern",
    "pauper",
    "pioneer",
    "sealed",
    "standard",
    "vintage",
];

/** One row of a format picker: a group heading or a format to pick */
export type FormatEntry =
    /** The heading over a group, listed where the group begins */
    | { kind: "heading"; slug: string; group: FormatGroup }
    /** A format to pick */
    | { kind: "format"; slug: string; name: string };

/**
 * Which group a format is listed under
 *
 * @param slug the format
 * @returns its group
 */
export function formatGroup(slug: string): FormatGroup {
    return POPULAR_FORMATS.includes(slug) ? "popular" : "rare";
}

/**
 * The rows of a format picker: both groups under their headings, each in
 * alphabetical order of names, narrowed to the formats matching `query`.
 *
 * A group without a matching format is left out with its heading.
 *
 * @param slugs the formats on offer
 * @param name what a format is called
 * @param query what was typed into the picker, case ignored; empty for every format
 * @returns the rows in order
 */
export function formatEntries(slugs: Array<string>, name: (slug: string) => string, query = ""): Array<FormatEntry> {
    const needle = query.trim().toLowerCase();
    const named = slugs
        .map((slug) => ({ slug, name: name(slug) }))
        .filter((format) => needle === "" || format.name.toLowerCase().includes(needle))
        .sort((left, right) => left.name.localeCompare(right.name));

    const entries: Array<FormatEntry> = [];
    for (const group of ["popular", "rare"] as const) {
        const members = named.filter((format) => formatGroup(format.slug) === group);
        if (members.length === 0) continue;
        entries.push({ kind: "heading", slug: `heading:${group}`, group });
        for (const format of members) entries.push({ kind: "format", ...format });
    }
    return entries;
}
