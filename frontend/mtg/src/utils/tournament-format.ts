/**
 * What a tournament's format implies beyond its deck rules: limited or constructed, table size,
 * scoring, round count and starting life.
 */

import { RoundKind } from "src/api/generated";

/** Whether the decks are brought along or built at the table */
export type FormatKind = "constructed" | "limited";

/** The formats built at the table from packs, mirroring the backend's `LIMITED_FORMATS`; draft first */
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
 * Duels use the MTR's 3/1/0; pods the Multiplayer Addendum (App. C), where a win is `2n − 1`.
 * A bye is worth a win in both.
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
 * Listed explicitly: needing a commander does not imply pods (Duel Commander, Brawl are duels).
 */
export const POD_FORMATS = ["commander", "predh", "paupercommander", "oathbreaker"] as const;

/**
 * How many players sit at one table of this format by default
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
 * Duels follow MTR App. E, pods the Multiplayer Addendum's App. E table.
 *
 * @param players how many people are expected to play
 * @param podSize how many players share a table
 *
 * @returns the recommended number of scoring rounds, at least one
 */
export function recommendedRounds(players: number, podSize: number): number {
    if (players < 2) return 1;

    if (podSize <= 2) {
        // Floored at three so a tiny event still plays an evening.
        const rounds = Math.ceil(Math.log2(players));
        return Math.min(Math.max(rounds, 3), 10);
    }

    if (players <= 5) return 1;
    if (players <= 16) return 2;
    if (players <= 24) return 3;
    if (players <= 32) return 4;
    if (players <= 64) return 5;
    return 6;
}

/**
 * Which round an event adds next: draft, then deckbuilding (limited only), then Swiss rounds
 *
 * @param format the event's format
 * @param rounds every round so far, any order
 *
 * @returns the kind of round to add
 */
export function nextRoundKind(format: string, rounds: ReadonlyArray<{ kind: RoundKind }>): RoundKind {
    const has = (kind: RoundKind) => rounds.some((round) => round.kind === kind);
    if (format === "draft" && !has(RoundKind.Draft)) return RoundKind.Draft;
    if (isLimitedFormat(format) && !has(RoundKind.Deckbuilding)) return RoundKind.Deckbuilding;
    return RoundKind.Swiss;
}

/** Starting life where a format departs from twenty */
const STARTING_LIFE: Record<string, number> = {
    commander: 40,
    predh: 40,
    paupercommander: 30,
    brawl: 25,
    standardbrawl: 25,
    competitivebrawl: 25,
};

/**
 * What everybody at a table of this format starts on
 *
 * @param slug the format
 *
 * @returns the starting life total
 */
export function startingLifeFor(slug: string): number {
    return STARTING_LIFE[slug] ?? 20;
}
