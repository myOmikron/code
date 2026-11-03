import type { Diagnostics } from "src/api/graph-generated";
import { ThemePrefs, themeTargetCards } from "src/utils/deck-theme-prefs";

/** The four axes a move is measured on, in the order badges read */
export type DimKind = "theme" | "bucket" | "type" | "curve";

const KIND_ORDER: ReadonlyArray<DimKind> = ["theme", "bucket", "type", "curve"];

/** One measured quantity of the deck and the range it should sit in */
export type Dim = {
    /** `<kind>:<id>`, e.g. `bucket:ramp`, `type:Creature`, `curve:2` */
    key: string;
    kind: DimKind;
    /** The theme id, bucket id, type name or mana value */
    id: string;
    value: number;
    low: number;
    high: number;
};

/** A card that can go in or come out, as far as its impact goes */
export type MovingCard = {
    cmc?: number;
    type_line?: string;
    profile?: { buckets?: Record<string, number | undefined>; themes?: Array<string> } | null;
};

/** Whether a change moves a dimension toward its range, away from it, or neither */
export type Tone = "good" | "neutral" | "warn";

/** One dimension a move changes */
export type Badge = { dim: Dim; delta: number; after: number; tone: Tone };

/** A dimension outside its range, and which way it has to move */
export type Need = { dim: Dim; up: boolean; gap: number };

/** Below this a change is a rounding, not a badge: a 0.3 ramp piece is nobody's ramp */
const MIN_DELTA = 0.5;

/** How far a curve column may stray from its target before it counts as off */
const CURVE_SLACK = 1;

/**
 * How far over a theme's target the deck may run before it counts as too much
 *
 * @param target the theme's target in cards
 *
 * @returns the slack in cards
 */
const themeSlack = (target: number) => Math.max(2, Math.round(target * 0.2));

/** The types a card is counted under, in the service's precedence (`composition.primary_type`) */
const TYPE_PRECEDENCE = ["Creature", "Planeswalker", "Instant", "Sorcery", "Artifact", "Enchantment", "Battle"];

/**
 * The one type a card is counted under, the way the service counts it
 *
 * @param typeLine the card's type line
 *
 * @returns the primary type, `Land` before anything else
 */
export function primaryType(typeLine: string): string {
    if (/\bLand\b/.test(typeLine)) return "Land";
    return TYPE_PRECEDENCE.find((name) => new RegExp(`\\b${name}\\b`).test(typeLine)) ?? "Other";
}

/**
 * Everything a move is measured against, read off the analysis
 *
 * @param report the deck's diagnostics
 * @param prefs the theme levels the reader set
 * @param themes the theme ids worth a badge: the listed and the targeted ones
 * @param curveTargets the reader's curve, in cards, when they set one
 *
 * @returns one dimension per theme, bucket, type and curve column
 */
export function deckDims(
    report: Diagnostics,
    prefs: ThemePrefs,
    themes: ReadonlyArray<string>,
    curveTargets: ReadonlyArray<number> | null,
): Array<Dim> {
    const spells = Math.max(0, report.deck_size - report.lands);
    const counts = Object.fromEntries((report.themes ?? []).map((theme) => [theme.theme, theme.cards ?? 0]));
    const themeDims = [...new Set([...themes, ...Object.keys(prefs.levels)])].map((id): Dim => {
        const level = prefs.levels[id];
        const target = level === undefined ? 0 : themeTargetCards(level, spells);
        const [low, high] =
            level === undefined ? [0, Infinity] : level === "avoid" ? [0, 0] : [target, target + themeSlack(target)];
        return { key: `theme:${id}`, kind: "theme", id, value: counts[id] ?? 0, low, high };
    });
    return [
        ...themeDims,
        ...report.buckets.map((bucket): Dim => ({
            key: `bucket:${bucket.bucket}`,
            kind: "bucket",
            id: bucket.bucket,
            value: bucket.coverage,
            low: bucket.low,
            high: bucket.high,
        })),
        ...(report.types ?? []).map((type): Dim => ({
            key: `type:${type.type}`,
            kind: "type",
            id: type.type,
            value: type.count,
            low: type.low,
            high: type.high,
        })),
        ...report.curve.map((column, index): Dim => {
            const target = curveTargets?.[index] ?? column.target;
            return {
                key: `curve:${column.mv}`,
                kind: "curve",
                id: String(column.mv),
                value: column.count,
                low: target - CURVE_SLACK,
                high: target + CURVE_SLACK,
            };
        }),
    ];
}

/**
 * How far a value sits outside a dimension's range
 *
 * @param dim the dimension
 * @param value the value to place
 *
 * @returns zero inside the range, the distance to its nearer edge outside it
 */
export function distance(dim: Dim, value: number): number {
    return value < dim.low ? dim.low - value : value > dim.high ? value - dim.high : 0;
}

/**
 * What one card adds to every dimension it counts toward
 *
 * @param card the card
 *
 * @returns dimension key to amount
 */
function contribution(card: MovingCard): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [bucket, amount] of Object.entries(card.profile?.buckets ?? {})) out[`bucket:${bucket}`] = amount ?? 0;
    for (const theme of card.profile?.themes ?? []) out[`theme:${theme}`] = 1;
    const type = primaryType(card.type_line ?? "");
    out[`type:${type}`] = 1;
    if (type !== "Land") out[`curve:${Math.min(6, Math.max(0, Math.floor(card.cmc ?? 0)))}`] = 1;
    return out;
}

/**
 * What a move does to the deck: a card in, a card out, or both
 *
 * @param add the card going in, if any
 * @param cut the card coming out, if any
 * @param dims the deck's dimensions, from {@link deckDims}
 *
 * @returns one badge per dimension that moves, improvements first; types and curve columns only when they help or hurt
 */
export function impact(add: MovingCard | null, cut: MovingCard | null, dims: ReadonlyArray<Dim>): Array<Badge> {
    const delta: Record<string, number> = {};
    for (const [key, amount] of Object.entries(add === null ? {} : contribution(add))) {
        delta[key] = (delta[key] ?? 0) + amount;
    }
    for (const [key, amount] of Object.entries(cut === null ? {} : contribution(cut))) {
        delta[key] = (delta[key] ?? 0) - amount;
    }
    const byKey = new Map(dims.map((dim) => [dim.key, dim]));
    const rank: Record<Tone, number> = { good: 0, neutral: 1, warn: 2 };
    return Object.entries(delta)
        .filter(([key, amount]) => Math.abs(amount) >= MIN_DELTA && byKey.has(key))
        .map(([key, amount]): Badge => {
            const dim = byKey.get(key)!;
            const after = dim.value + amount;
            const before = distance(dim, dim.value);
            const then = distance(dim, after);
            const tone: Tone = then < before - 0.01 ? "good" : then > before + 0.01 ? "warn" : "neutral";
            return { dim, delta: amount, after, tone };
        })
        .filter((badge) => badge.tone !== "neutral" || badge.dim.kind === "theme" || badge.dim.kind === "bucket")
        .sort(
            (a, b) =>
                rank[a.tone] - rank[b.tone] ||
                KIND_ORDER.indexOf(a.dim.kind) - KIND_ORDER.indexOf(b.dim.kind) ||
                Math.abs(b.delta) - Math.abs(a.delta),
        );
}

/**
 * The dimensions outside their range, as the deck's needs
 *
 * @param dims the deck's dimensions
 *
 * @returns themes first, then buckets, types and curve, the widest gap first within each
 */
export function needs(dims: ReadonlyArray<Dim>): Array<Need> {
    return dims
        .map((dim) => ({ dim, up: dim.value < dim.low, gap: distance(dim, dim.value) }))
        .filter((need) => need.gap >= MIN_DELTA)
        .sort((a, b) => KIND_ORDER.indexOf(a.dim.kind) - KIND_ORDER.indexOf(b.dim.kind) || b.gap - a.gap);
}

/**
 * Whether a badge improves something a player builds around: a theme or a role
 *
 * @param badge the badge
 *
 * @returns true for an improved theme or bucket
 */
export function relevant(badge: Badge): boolean {
    return badge.tone === "good" && (badge.dim.kind === "theme" || badge.dim.kind === "bucket");
}

/** One way to make room for a card */
export type Room<Cut> = { cut: Cut; badges: Array<Badge> };

/**
 * The cuts that make room for a card without making anything worse
 *
 * Only exchanges that move at least one dimension toward its range and push
 * none away from it: a swap the reader has to second-guess is not offered.
 *
 * @param add the card going in
 * @param cuts the cut candidates, best cut first
 * @param dims the deck's dimensions
 * @param limit how many to return
 *
 * @returns the options, those helping a theme or role most first
 */
export function roomFor<Cut extends MovingCard>(
    add: MovingCard,
    cuts: ReadonlyArray<Cut>,
    dims: ReadonlyArray<Dim>,
    limit = 5,
): Array<Room<Cut>> {
    return cuts
        .map((cut, index) => ({ cut, index, badges: impact(add, cut, dims) }))
        .filter(({ badges }) => badges.some((b) => b.tone === "good") && !badges.some((b) => b.tone === "warn"))
        .sort(
            (a, b) =>
                b.badges.filter(relevant).length - a.badges.filter(relevant).length ||
                b.badges.filter((x) => x.tone === "good").length - a.badges.filter((x) => x.tone === "good").length ||
                a.index - b.index,
        )
        .slice(0, limit)
        .map(({ cut, badges }) => ({ cut, badges }));
}

/**
 * Whether a full deck has nothing left a swap would clearly improve
 *
 * @param adds the suggestions
 * @param cuts the cut candidates
 * @param dims the deck's dimensions
 *
 * @returns true when no suggestion can make room in a way that helps a theme or role
 */
export function plateaued(
    adds: ReadonlyArray<MovingCard>,
    cuts: ReadonlyArray<MovingCard>,
    dims: ReadonlyArray<Dim>,
): boolean {
    return !adds.some((add) => roomFor(add, cuts, dims, cuts.length).some((room) => room.badges.some(relevant)));
}
