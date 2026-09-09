/**
 * What a tournament's format says about the event that the deck rules do not.
 *
 * Two questions the format catalog cannot answer: which formats are played at a
 * tournament without a deck being built for them in advance (the limited ones,
 * which the catalog therefore does not list), and how many players a table of a
 * format seats.
 */

import type { FormatRulesResponse } from "src/api/generated";

/** Whether the decks are brought along or built at the table */
export type FormatKind = "constructed" | "limited";

/**
 * The formats built at the table from packs — mirrors the backend's `LIMITED_FORMATS`
 *
 * Draft first: it is the one an evening at the store usually means.
 */
export const LIMITED_FORMATS = ["draft", "sealed"] as const;

/** One of the {@link LIMITED_FORMATS} */
export type LimitedFormat = (typeof LIMITED_FORMATS)[number];

/** What a fresh tournament is played in, and what "Constructed" falls back to */
export const DEFAULT_CONSTRUCTED_FORMAT = "commander";

/** What "Limited" falls back to */
export const DEFAULT_LIMITED_FORMAT: LimitedFormat = "draft";

/**
 * Whether a slug names one of the {@link LIMITED_FORMATS}
 *
 * @param slug the format
 *
 * @returns `true` for draft and sealed
 */
export function isLimitedFormat(slug: string): slug is LimitedFormat {
    return (LIMITED_FORMATS as ReadonlyArray<string>).includes(slug);
}

/**
 * Which kind of event a format makes
 *
 * @param slug the format
 *
 * @returns limited for draft and sealed, constructed for everything else
 */
export function formatKind(slug: string): FormatKind {
    return isLimitedFormat(slug) ? "limited" : "constructed";
}

/**
 * How many players sit at one table of this format
 *
 * Pods of four for the commander formats, two for everything else: the sixty card formats, the
 * limited formats (drafted in pods, but played one on one), and Duel Commander, which is one on
 * one by definition however much it looks like Commander otherwise. A slug the catalog does not
 * know reads as a table of two as well — that is the shape most formats have.
 *
 * @param slug the format
 * @param formats the catalog, for whether the format wants a commander
 *
 * @returns four or two
 */
export function podSizeFor(slug: string, formats: Array<FormatRulesResponse>): number {
    if (slug === "duel") return 2;
    const rules = formats.find((format) => format.slug === slug);
    return rules !== undefined && rules.commander.kind !== "none" ? 4 : 2;
}
