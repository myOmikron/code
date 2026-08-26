/**
 * How much of a theme reading the deck actually supports.
 *
 * The service's theme profile is a *distribution*: it divides every theme by
 * the grand total of all of them, so a deck in which seven cards read as
 * anything at all still comes back as "Vehicles, 34%". Drawn as a radar
 * normalised against its own strongest lobe, that becomes "this deck is
 * Vehicles" in a shape nobody can argue with — off seven cards, on a real
 * list whose nineteen reanimator cards sat second.
 *
 * So nothing here reads a share as an amount. The cards behind a theme are
 * the amount, the share only orders ties, and how much deck is behind the
 * strongest theme decides whether there is a reading to draw at all.
 */

import { Diagnostics } from "src/api/graph-generated";

/** One axis of a deck's theme profile */
export type ThemeAxis = {
    /** The theme id */
    id: string;
    /** What the theme is called, as the service labelled it */
    label: string;
    /** How many cards in the deck read as it */
    cards: number;
    /** Its share of the deck's theme signal, for ordering and for the tooltip */
    share: number;
};

/** How confident the reading is, and what it rests on */
export type ThemeRead = {
    /**
     * `clear` when enough of the deck reads as its strongest theme to draw
     * one, `weak` when a shape exists but rests on few cards, `none` when
     * there is nothing here worth calling an identity.
     */
    level: "clear" | "weak" | "none";
    /** The themes worth naming, strongest first */
    axes: Array<ThemeAxis>;
    /** How many cards read as any theme at all */
    themed: number;
    /** The non-land cards those are counted out of */
    spells: number;
    /**
     * Whether there are enough axes to draw a shape rather than list rows.
     * Three is the floor: two axes is a line wearing a costume.
     */
    shape: boolean;
};

/** How many axes the theme radar draws at most */
const AXIS_LIMIT = 6;

/** Below this a theme is one or two cards brushing past, not a strand of the deck */
const MIN_CARDS = 3;

/**
 * How many cards must read as the strongest theme before a deck is called
 * that theme.
 *
 * Ten, from the dev decks: a built Elf list puts 51 cards behind its typal
 * read and a tokens list 47, while a good but unfocused list's top theme sat
 * at 19 — all of them decks whose owner would name the strategy. The list
 * that read as "Vehicles" off 7 is the one this number exists to catch.
 */
const CLEAR_CARDS = 10;

/** A radar needs three axes; two is a line wearing a costume */
const MIN_AXES = 3;

/**
 * What the deck's theme profile actually supports.
 *
 * Ordered by *cards*, not by share: the share carries the commander anchor,
 * which is intent rather than content, and a commander is very good at
 * arguing for a theme the 99 has barely built. Both numbers ride along, so
 * the panel can say "19 cards" and still explain the ordering.
 *
 * @param report the diagnostics report
 *
 * @returns the reading, and how much deck is behind it
 */
export function themeRead(report: Diagnostics): ThemeRead {
    const spells = Math.max(0, report.deck_size - report.lands);
    const themed = report.themed_cards ?? 0;

    // `cards` is optional on the wire — a report from a service older than the
    // count reads as zero here, which lands the whole panel on "no obvious
    // theme" rather than on a confident shape drawn from a number that is not
    // there. The safe direction.
    const axes = (report.themes ?? [])
        .map((theme) => ({ id: theme.theme, label: theme.label, cards: theme.cards ?? 0, share: theme.share }))
        .filter((axis) => axis.cards >= MIN_CARDS)
        .sort((left, right) => right.cards - left.cards || right.share - left.share)
        .slice(0, AXIS_LIMIT);

    const top = axes[0]?.cards ?? 0;
    const level = top >= CLEAR_CARDS ? "clear" : top >= MIN_CARDS ? "weak" : "none";

    return { level, axes, themed, spells, shape: axes.length >= MIN_AXES };
}
