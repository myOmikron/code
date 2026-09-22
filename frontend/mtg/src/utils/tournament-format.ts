/**
 * What a tournament's format says about the event that the deck rules do not.
 *
 * Two questions the format catalog cannot answer: which formats are played at a
 * tournament without a deck being built for them in advance (the limited ones,
 * which the catalog therefore does not list), and how many players a table of a
 * format seats.
 */

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

/** The match points a fresh event of this table size starts on */
export type PointsDefaults = { win: number; draw: number; loss: number; bye: number };

/**
 * What a fresh event's match points start on, derived from the table size
 *
 * A table of two plays the Magic Tournament Rules' 3/1/0 with a bye worth a win — the scoring
 * every 1v1 event, sanctioned or not, already uses. A pod scores by the judge community's
 * Multiplayer Addendum instead (App. C): a win is worth `n` base points plus `n·(1 − 1/n)` for
 * how much harder it is to win against more opponents, which simplifies to `2n − 1` — 7 at a pod
 * of four, 5 at three, 9 at five. A bye counts as a win there too, and a draw or a loss does not
 * change with the table.
 *
 * @param podSize how many players share a table
 *
 * @returns the four starting values
 */
export function pointsFor(podSize: number): PointsDefaults {
    if (podSize <= 2) return { win: 3, draw: 1, loss: 0, bye: 3 };
    const win = 2 * podSize - 1;
    return { win, draw: 1, loss: 0, bye: win };
}

/**
 * The formats seated in pods rather than one on one
 *
 * Stated outright rather than derived from whether the format wants a commander, which is what
 * this used to ask. Those are two different questions and the answers come apart: Duel Commander,
 * Archon and the three Brawls all need a commander and are all played one on one. Reading
 * "has a commander" as "is multiplayer" gave every one of them a pod of four, and with it a
 * best-of-one and the 7/1/0 scoring a pod uses — three wrong defaults from one wrong premise.
 *
 * Commander with a different card pool is still Commander, so Pre-EDH and Pauper Commander are
 * here; Oathbreaker is its own format but is likewise normally played in pods.
 */
export const POD_FORMATS = ["commander", "predh", "paupercommander", "oathbreaker"] as const;

/**
 * How many players sit at one table of this format
 *
 * Four for the formats played in pods, two for everything else — the sixty card formats, the
 * limited ones (drafted in pods but played one on one), the one-on-one commander formats, and any
 * slug this does not recognise, since a table of two is the shape most formats have.
 *
 * Only ever a default. It fills the field in the create dialog, and an organizer running
 * three-player pods of something changes it.
 *
 * @param slug the format
 *
 * @returns four or two
 */
export function podSizeFor(slug: string): number {
    return (POD_FORMATS as ReadonlyArray<string>).includes(slug) ? 4 : 2;
}

/**
 * How many Swiss rounds a field of this size usually plays
 *
 * Two different tables, because the two table sizes answer the question differently. A duel event
 * follows the Magic Tournament Rules' Appendix E, which is the binary-search shape everybody knows:
 * enough rounds that one undefeated player is left. Pods follow the judge community's Multiplayer
 * Addendum instead, which runs markedly shorter — four players knock each other out four times as
 * fast, so sixteen players need two rounds where a duel event would need four.
 *
 * Only ever a suggestion. It fills the field in the create dialog and the start confirmation; an
 * organizer who wants three rounds on a Friday evening types three, and nothing argues.
 *
 * @param players how many people are expected to play
 * @param podSize how many players share a table
 *
 * @returns the recommended number of scoring rounds, at least one
 */
export function recommendedRounds(players: number, podSize: number): number {
    if (players < 2) return 1;

    if (podSize <= 2) {
        // MTR App. E: ceil(log2(players)), which is exactly "how many halvings
        // until one player is left", floored at three so a tiny event still
        // plays an evening rather than a single match.
        const rounds = Math.ceil(Math.log2(players));
        return Math.min(Math.max(rounds, 3), 10);
    }

    // Multiplayer Addendum App. E, read off its own table rather than derived:
    // the thresholds are not a clean function of the player count.
    if (players <= 5) return 1;
    if (players <= 16) return 2;
    if (players <= 24) return 3;
    if (players <= 32) return 4;
    if (players <= 64) return 5;
    return 6;
}

