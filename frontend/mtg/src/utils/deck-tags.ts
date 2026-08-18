/**
 * The etiquettes a deck's cards carry, and the colours they are drawn in.
 *
 * A tag is stored as a name and a colour slug, and the slug has to survive a
 * round trip through a database column that any client may have written. Both
 * ends of that are handled here: the palette that is offered, and the reading
 * of whatever comes back.
 */

import type { DeckCardResponse, DeckTagResponse } from "src/api/generated";

/** The colours a tag can be drawn in, in the order they are offered */
export const TAG_COLORS = [
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

/** One of the colours a tag can be drawn in */
export type TagColor = (typeof TAG_COLORS)[number];

/** The colour a tag falls back to */
export const TAG_COLOR_FALLBACK: TagColor = "zinc";

/**
 * The dot a colour is drawn as
 *
 * Spelled out rather than built from the slug: Tailwind reads the class names
 * out of the source, and one assembled at runtime is never generated.
 */
export const TAG_DOT: Record<TagColor, string> = {
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
 * The colour a tag is drawn in
 *
 * @param color what the tag says it is
 *
 * @returns that colour, or the fallback for anything unknown
 */
export function tagColor(color: string): TagColor {
    return (TAG_COLORS as ReadonlyArray<string>).includes(color) ? (color as TagColor) : TAG_COLOR_FALLBACK;
}

/**
 * The tags sitting on one slot
 *
 * @param card the slot
 * @param tags every tag that exists
 *
 * @returns the ones on the slot, in the order the tags are listed
 */
export function tagsOn(card: DeckCardResponse, tags: Array<DeckTagResponse>): Array<DeckTagResponse> {
    return tags.filter((tag) => card.tags.includes(tag.uuid));
}

/**
 * The tags a deck is built with, and where each of them belongs
 *
 * The five that describe what a card *does* are the same in every deck, so they
 * are offered on the account; the two that describe what *this* deck does with
 * them are local, because a game plan does not carry over.
 *
 * Kept as the words the format is talked in rather than translated: a deck is
 * discussed as ramp and tutors in every language, and a tag is a name the owner
 * reads, not a label the app owns.
 */
export const TAG_PRESET: Array<{ name: string; color: TagColor; global: boolean }> = [
    { name: "Card Advantage", color: "blue", global: true },
    { name: "Ramp", color: "lime", global: true },
    { name: "Targeted Disruption", color: "red", global: true },
    { name: "Mass Disruption", color: "orange", global: true },
    { name: "Tutor", color: "violet", global: true },
    { name: "Game Plan", color: "cyan", global: false },
    { name: "Wincon", color: "fuchsia", global: false },
];

/**
 * Read a field of tag names, one tag per comma
 *
 * @param input what was typed
 *
 * @returns the names, trimmed, without repeats or blanks
 */
export function readTagNames(input: string): Array<string> {
    const names: Array<string> = [];
    for (const part of input.split(/[,;]/)) {
        const name = part.trim();
        if (name !== "" && !names.some((taken) => taken.toLowerCase() === name.toLowerCase())) names.push(name);
    }
    return names;
}
