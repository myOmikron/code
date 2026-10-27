/**
 * Which of the deck's detected themes deserve the word.
 *
 * The service's theme profile is a *distribution*: it divides every theme by
 * the grand total of all of them, so a deck in which seven cards read as
 * anything at all still comes back as "Vehicles, 34%", and two cards that
 * happen to put counters on things come back as a "+1/+1 counters" theme. A
 * theme is a claim about what the deck is doing, and two cards do not make
 * one. So nothing here reads a share as an amount: the cards behind a theme
 * are the amount, and a theme is listed only once enough of the deck is
 * behind it — or once the reader has said how much of it they want, which
 * is the one thing that can put an unbuilt theme on the list.
 */

import { Diagnostics } from "src/api/graph-generated";
import { ThemePrefs } from "src/utils/deck-theme-prefs";

/** One theme, as the panel lists it */
export type ThemeRow = {
    /** The theme id */
    id: string;
    /** What the theme is called, as the service labelled it */
    label: string;
    /** How many cards in the deck read as it */
    cards: number;
    /** Whether enough of the deck is behind it to call it a theme on its own */
    confident: boolean;
};

/** What the deck's theme profile supports, split into what is said and what is not */
export type ThemeListing = {
    /** The themes worth a row: confident ones, plus any the reader set a level for */
    listed: Array<ThemeRow>;
    /** Themes a few cards brush past — named in a footnote, never as a row */
    faint: Array<ThemeRow>;
    /** How many cards read as any theme at all */
    themed: number;
    /** The non-land cards those are counted out of */
    spells: number;
};

/**
 * The fewest cards a theme needs before it is listed.
 *
 * Six: the panel used to offer a chip at two cards and draw a radar axis at
 * three, and "+1/+1 counters" off two cards was the most common complaint
 * about it. Six is a real strand of a deck — a fifth of the way to the
 * count the detector was calibrated as a clear read on.
 */
export const THEME_LIST_MIN_CARDS = 6;

/**
 * The smallest share of the non-land cards a listed theme must hold.
 *
 * A second floor beside the card count, for decks that run more spells than
 * a Commander deck: six cards of two hundred is not a theme either.
 */
export const THEME_LIST_MIN_SHARE = 0.1;

/** Below this a theme is not even a footnote */
const FAINT_MIN_CARDS = 2;

/**
 * How many cards a theme needs to be listed in a deck of this many spells
 *
 * @param spells the deck's non-land count
 *
 * @returns the floor, in cards
 */
export function themeListFloor(spells: number): number {
    return Math.max(THEME_LIST_MIN_CARDS, Math.ceil(THEME_LIST_MIN_SHARE * Math.max(0, spells)));
}

/**
 * Which themes the panel lists, and which it only footnotes.
 *
 * Ordered by *cards*, not by share: the share carries the commander anchor,
 * which is intent rather than content, and a commander is very good at
 * arguing for a theme the 99 has barely built.
 *
 * A theme the reader set a level for is always listed, however few cards
 * say so yet — on a half-built deck they are the only one who knows what it
 * is for, and the row is the only control for the level. When the report no
 * longer knows the theme at all, the row still exists at zero cards, named
 * from `labels` where the caller knows a name and from the id otherwise.
 *
 * `cards` is optional on the wire — a report from a service older than the
 * count reads as zero here, which keeps every theme out of the list rather
 * than letting a confident shape be drawn from a number that is not there.
 * The safe direction.
 *
 * @param report the diagnostics report
 * @param prefs what the reader has said about the themes
 * @param labels display names for themes the report does not carry, by id
 *
 * @returns the listing
 */
export function themeListing(report: Diagnostics, prefs: ThemePrefs, labels?: Record<string, string>): ThemeListing {
    const spells = Math.max(0, report.deck_size - report.lands);
    const themed = report.themed_cards ?? 0;
    const floor = themeListFloor(spells);
    const { levels } = prefs;

    const rows = (report.themes ?? []).map((theme) => ({
        id: theme.theme,
        label: theme.label,
        cards: theme.cards ?? 0,
        confident: (theme.cards ?? 0) >= floor,
    }));
    const known = new Set(rows.map((row) => row.id));
    // Opinions the profile no longer supports, kept reachable: a theme that
    // vanished from the report would otherwise be impossible to reset,
    // because the row is the only control for it.
    const orphaned = Object.keys(levels)
        .filter((id) => !known.has(id))
        .map((id) => ({ id, label: labels?.[id] ?? id.replace(/_/g, " "), cards: 0, confident: false }));

    const byCards = (left: ThemeRow, right: ThemeRow) =>
        right.cards - left.cards || left.label.localeCompare(right.label);
    const listed = [...rows.filter((row) => row.confident || row.id in levels), ...orphaned].sort(byCards);
    const faint = rows
        .filter((row) => !row.confident && !(row.id in levels) && row.cards >= FAINT_MIN_CARDS)
        .sort(byCards);

    return { listed, faint, themed, spells };
}
