/**
 * The targets one deck is graded against, where the builder moved them.
 *
 * The advisor's quotas and curve are *defaults*, not rules. A template picked
 * off a bracket cannot know that this deck runs eighteen pieces of
 * interaction on purpose, and until the numbers could be moved the only thing
 * the panel could say about a deliberate choice was that it was wrong.
 *
 * Kept on the device beside the ignore list and the theme preferences, for
 * the same reason: a target is a lens on the advice, not deck content. What
 * the deck *is* stays in the deck; what it is being read against stays here.
 *
 * Only the edits are stored. A bucket nobody dragged keeps following the
 * bracket, so a deck moved from bracket 3 to 4 still moves its untouched
 * targets with it — storing the full preset would silently freeze them.
 */

import { Bucket, BucketRange, CurvePoint, TypeRange } from "src/api/graph-generated";

/** Where the targets live, one map for all decks */
const STORAGE_KEY = "cardlens.deck-targets.v1";

/** How many mana-value columns the curve has: 0…5 and "6 or more" */
export const CURVE_COLUMNS = 7;

/**
 * The primary types the service grades against, mirroring its own
 * `type_targets.PRIMARY_TYPES`.
 *
 * Held here so a corridor stored under a name the service no longer knows is
 * dropped on the way out of storage rather than 422ing the request it rides —
 * losing one stale preference beats losing the whole report.
 */
const PRIMARY_TYPES = new Set([
    "Creature",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
    "Planeswalker",
    "Battle",
    "Land",
]);

/** One bucket's target corridor, as the builder set it */
export type Corridor = {
    /** The floor, in cards */
    low: number;
    /** The ceiling, in cards */
    high: number;
};

/** What one deck is measured against, where it differs from the preset */
export type DeckTargets = {
    /** Corridors by bucket id, only for the buckets that were moved */
    buckets: Record<string, Corridor>;
    /**
     * Corridors by primary type, only for the types that were moved.
     *
     * The functional axis' twin. These targets are measured rather than
     * bracketed — each one a commander page's own distribution — but a
     * measurement is still an offer: a deck that runs thirty-four lands on
     * purpose says so here, and the service grades every quota, cut and fill
     * against that number instead. Moving the Land corridor moves the mana
     * source quota with it, service-side, so the two panels never argue
     * about the same decision.
     */
    types: Record<string, Corridor>;
    /**
     * The target curve as shares per mana value, indexed by mana value, or
     * `null` while the bracket's own shape stands.
     *
     * Shares rather than card counts, because a target is `share × spell
     * count` and the two halves belong to different people: the builder owns
     * the shape, the deck owns how many spells there are. A shape dragged at
     * 63 spells still means the same thing at 66.
     *
     * All seven or nothing: a curve is one shape, and half a shape has no
     * reading.
     */
    curve: Array<number> | null;
};

/** A deck that is still read against its bracket alone */
export const DEFAULT_TARGETS: DeckTargets = { buckets: {}, types: {}, curve: null };

/** The bucket ids the service knows, for rejecting anything else off the device */
const BUCKETS = new Set<string>(Object.values(Bucket));

/**
 * Strings, numbers and known buckets only.
 *
 * Stored JSON is whatever a past release or a hand-edit left behind, and one
 * malformed entry must not cost every deck its targets — the caller reads all
 * decks at once.
 *
 * @param raw the parsed entry to clean
 *
 * @returns the targets it describes, dropping whatever it does not
 */
function sanitise(raw: unknown): DeckTargets {
    const source = typeof raw === "object" && raw !== null ? (raw as Partial<DeckTargets>) : {};

    const buckets: Record<string, Corridor> = {};
    for (const [bucket, corridor] of Object.entries(source.buckets ?? {})) {
        if (!BUCKETS.has(bucket) || typeof corridor !== "object" || corridor === null) continue;
        const { low, high } = corridor as Corridor;
        if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
        // Sorted rather than rejected: a handle dragged past its partner is a
        // gesture, not an error, and the service resolves it the same way.
        buckets[bucket] = { low: Math.min(low, high), high: Math.max(low, high) };
    }

    const types: Record<string, Corridor> = {};
    for (const [name, corridor] of Object.entries(source.types ?? {})) {
        if (!PRIMARY_TYPES.has(name) || typeof corridor !== "object" || corridor === null) continue;
        const { low, high } = corridor as Corridor;
        if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
        types[name] = { low: Math.min(low, high), high: Math.max(low, high) };
    }

    const curve = source.curve;
    const shape =
        Array.isArray(curve) &&
        curve.length === CURVE_COLUMNS &&
        curve.every((share) => Number.isFinite(share) && share >= 0) &&
        curve.some((share) => share > 0)
            ? curve.map((share) => Number(share))
            : null;

    return { buckets, types, curve: shape };
}

/**
 * Reads every deck's stored targets, dropping anything malformed
 *
 * @returns the targets by deck uuid
 */
function readAll(): Record<string, DeckTargets> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return {};
        return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).map(([uuid, entry]) => [uuid, sanitise(entry)]),
        );
    } catch {
        return {};
    }
}

/**
 * What one deck is read against
 *
 * @param deckUuid the deck
 *
 * @returns its targets, or the untouched defaults
 */
export function readTargets(deckUuid: string): DeckTargets {
    return readAll()[deckUuid] ?? DEFAULT_TARGETS;
}

/**
 * Records what one deck is read against.
 *
 * A deck back on its defaults drops out of storage entirely rather than
 * leaving an empty entry behind, so "never touched" and "reset" are the same
 * state on disk as they are on screen.
 *
 * @param deckUuid the deck
 * @param targets what it should be measured against
 */
export function writeTargets(deckUuid: string, targets: DeckTargets): void {
    try {
        const all = readAll();
        if (isDefault(targets)) {
            delete all[deckUuid];
        } else {
            all[deckUuid] = sanitise(targets);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
        // A full or blocked storage costs the preference, not the page.
    }
}

/**
 * Whether nothing has been moved
 *
 * @param targets the targets to test
 *
 * @returns true when the bracket's own numbers still stand
 */
export function isDefault(targets: DeckTargets): boolean {
    return (
        Object.keys(targets.buckets).length === 0 && Object.keys(targets.types).length === 0 && targets.curve === null
    );
}

/**
 * Sets one bucket's corridor, keeping the rest
 *
 * @param targets the targets to edit
 * @param bucket the bucket id being moved
 * @param corridor the corridor it should be graded against
 *
 * @returns the edited targets
 */
export function withCorridor(targets: DeckTargets, bucket: string, corridor: Corridor): DeckTargets {
    return {
        ...targets,
        buckets: {
            ...targets.buckets,
            [bucket]: { low: Math.min(corridor.low, corridor.high), high: Math.max(corridor.low, corridor.high) },
        },
    };
}

/**
 * Puts one bucket back on the bracket's own corridor
 *
 * @param targets the targets to edit
 * @param bucket the bucket id to release
 *
 * @returns the edited targets
 */
export function withoutCorridor(targets: DeckTargets, bucket: string): DeckTargets {
    const buckets = { ...targets.buckets };
    delete buckets[bucket];
    return { ...targets, buckets };
}

/**
 * Sets one primary type's corridor, keeping the rest
 *
 * @param targets the targets to edit
 * @param type the primary type being moved
 * @param corridor the corridor it should be graded against
 *
 * @returns the edited targets
 */
export function withTypeCorridor(targets: DeckTargets, type: string, corridor: Corridor): DeckTargets {
    return {
        ...targets,
        types: {
            ...targets.types,
            [type]: { low: Math.min(corridor.low, corridor.high), high: Math.max(corridor.low, corridor.high) },
        },
    };
}

/**
 * Puts one primary type back on the archetype's measured corridor
 *
 * @param targets the targets to edit
 * @param type the primary type to release
 *
 * @returns the edited targets
 */
export function withoutTypeCorridor(targets: DeckTargets, type: string): DeckTargets {
    const types = { ...targets.types };
    delete types[type];
    return { ...targets, types };
}

/**
 * Sets the whole curve shape from card counts per mana value.
 *
 * Counts in, shares out: the panel is dragged in cards because that is what a
 * deckbuilder counts, and the service is told the shape, because that is what
 * survives the deck changing size.
 *
 * @param targets the targets to edit
 * @param counts the target card count per mana value, index 0…6
 *
 * @returns the edited targets, or the untouched ones for an empty shape
 */
export function withCurve(targets: DeckTargets, counts: Array<number>): DeckTargets {
    const clean = Array.from({ length: CURVE_COLUMNS }, (_, mv) => Math.max(0, counts[mv] ?? 0));
    const total = clean.reduce((sum, count) => sum + count, 0);
    if (total <= 0) return targets;
    return { ...targets, curve: clean.map((count) => count / total) };
}

/**
 * Puts the curve back on the bracket's own shape
 *
 * @param targets the targets to edit
 *
 * @returns the edited targets
 */
export function withoutCurve(targets: DeckTargets): DeckTargets {
    return { ...targets, curve: null };
}

/**
 * The curve as card counts against a deck of this many spells.
 *
 * The one place the share × spell-count product is taken on this side, and it
 * is deliberately the same arithmetic the service does — the panel shows the
 * numbers the advice is graded against, or the picture and the advice
 * disagree about a target the user set themselves.
 *
 * @param targets what the deck is read against
 * @param spells how many non-land cards the deck holds
 *
 * @returns the target count per mana value, or null while the bracket's shape stands
 */
export function curveCounts(targets: DeckTargets, spells: number): Array<number> | null {
    if (targets.curve === null) return null;
    const total = targets.curve.reduce((sum, share) => sum + share, 0);
    if (total <= 0) return null;
    return targets.curve.map((share) => (share / total) * spells);
}

/**
 * The bucket corridors as the service takes them
 *
 * @param targets what the deck is read against
 *
 * @returns the overrides to send, empty when none were set
 */
export function bucketRanges(targets: DeckTargets): Array<BucketRange> {
    return Object.entries(targets.buckets)
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([bucket, corridor]) => ({ bucket: bucket as Bucket, low: corridor.low, high: corridor.high }));
}

/**
 * The type corridors as the service takes them
 *
 * @param targets what the deck is read against
 *
 * @returns the overrides to send, empty when none were set
 */
export function typeRanges(targets: DeckTargets): Array<TypeRange> {
    return Object.entries(targets.types)
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([type, corridor]) => ({ type, low: corridor.low, high: corridor.high }));
}

/**
 * The curve shape as the service takes it
 *
 * @param targets what the deck is read against
 *
 * @returns the points to send, empty while the bracket's shape stands
 */
export function curvePoints(targets: DeckTargets): Array<CurvePoint> {
    return targets.curve === null ? [] : targets.curve.map((share, mv) => ({ mv, share }));
}

/**
 * Content-addresses the targets, for the query key the advisor caches on.
 *
 * Everything the service is told has to be in here, or an answer computed
 * against the old numbers is served for the new ones.
 *
 * @param targets what the deck is read against
 *
 * @returns a string equal iff the request would be equal
 */
export function targetsKey(targets: DeckTargets): string {
    const buckets = bucketRanges(targets)
        .map((range) => `${range.bucket}:${range.low}-${range.high}`)
        .join(",");
    const types = typeRanges(targets)
        .map((range) => `${range.type}:${range.low}-${range.high}`)
        .join(",");
    const curve = targets.curve === null ? "-" : targets.curve.map((share) => share.toFixed(4)).join("/");
    return `t:${buckets};y:${types};c:${curve}`;
}
