/* tslint:disable */
/* eslint-disable */

/**
 * Whether one interaction row answers one fold class.
 * @export
 */
export const AnswerGrade = {
    answers: 'answers',
    partially: 'partially',
    no: 'no',
} as const;
export type AnswerGrade = typeof AnswerGrade[keyof typeof AnswerGrade];

/**
 * `Diagnostics.cedh_position` (diagnostics.py names the field; this is
 * its value type). `archetype_class` rather than the task shorthand
 * `class` — a reserved word. `speed`/`interaction` are `None` only when
 * the corresponding axis has no defined value for this deck (a deck with
 * no complete candidate line has `speed=None`); `below_floor` depends
 * only on `interaction` against the class's own floor, never on speed.
 * @export
 * @interface AxesPosition
 */
export interface AxesPosition {
    /**
     * 
     */
    speed: number | null;
    /**
     * 
     */
    speed_axis: string;
    /**
     * 
     */
    interaction: number;
    /**
     * 
     */
    interaction_axis: string;
    /**
     * 
     */
    archetype_class: string;
    /**
     * 
     */
    floor: number | null;
    /**
     * 
     */
    below_floor: boolean | null;
    /**
     * 
     */
    note?: string;
}

/**
 * User-facing composition categories, shown on the diagnostics tab.
 * @export
 */
export const Bucket = {
    mana_sources: 'mana_sources',
    ramp: 'ramp',
    card_draw: 'card_draw',
    interaction: 'interaction',
    synergy_wincon: 'synergy_wincon',
} as const;
export type Bucket = typeof Bucket[keyof typeof Bucket];

/**
 * 
 * @export
 * @interface BucketDelta
 */
export interface BucketDelta {
    /**
     * 
     */
    bucket: string;
    /**
     * 
     */
    before: number;
    /**
     * 
     */
    after: number;
    /**
     * 
     */
    low: number;
    /**
     * 
     */
    high: number;
}
/**
 * A user's edit to one bucket's target range. Either bound may be omitted.
 * @export
 * @interface BucketRange
 */
export interface BucketRange {
    /**
     * 
     */
    bucket: Bucket;
    /**
     * 
     */
    low?: number | null;
    /**
     * 
     */
    high?: number | null;
}


/**
 * 
 * @export
 * @interface BucketReport
 */
export interface BucketReport {
    /**
     * 
     */
    bucket: string;
    /**
     * 
     */
    coverage: number;
    /**
     * 
     */
    low: number;
    /**
     * 
     */
    high: number;
    /**
     * 
     */
    deviation: number;
    /**
     * 
     */
    status: string;
    /**
     * 
     */
    default_low?: number;
    /**
     * 
     */
    default_high?: number;
    /**
     * 
     */
    cards?: Array<CountedCard>;
}
/**
 * The consistency-math counts a competitive player already works out by
 * hand (Task D, cEDH Pro round) — `None` on `Diagnostics.cedh_stats` below
 * bracket 5, additive, every other field on `Diagnostics` unaffected.
 * 
 * `fast_mana_count` is the union of `Resource.FAST_MANA` and
 * `Resource.RITUAL_MANA` producers — what a cEDH player means by "fast
 * mana" includes Dark Ritual (see the comment at the computation);
 * `free_spell_count` is `Resource.FREE_SPELL`'s own producer count — the same headcount
 * `ResourceBalance.produced` already reports for every resource, read here
 * off the same `balance` data rather than recomputed. `tutor_count` is
 * `Role.TUTOR`'s fractional weight (`tutor-to`, the reach-but-don't-quite
 * tag, scores 0.8 — see `tag_mapping.py`), the same number
 * `Diagnostics.roles["tutor"]` already carries. `mean_mana_value` repeats
 * `Diagnostics.average_mv` — same computation, same value — so a cEDH
 * consumer reads every consistency number off this one block instead of
 * reaching back into the shape report for one of them.
 * 
 * `land_count`/`tapped_land_count`/`untapped_land_count` are exact,
 * quantity-weighted card counts (see `tapped_land_counts` for the D3
 * extraction); only `tutor_count` genuinely carries a fraction.
 * @export
 * @interface CedhStats
 */
export interface CedhStats {
    /**
     * 
     */
    fast_mana_count: number;
    /**
     * 
     */
    tutor_count: number;
    /**
     * 
     */
    free_spell_count: number;
    /**
     * 
     */
    mean_mana_value: number | null;
    /**
     * 
     */
    land_count: number;
    /**
     * 
     */
    untapped_land_count: number;
    /**
     * 
     */
    tapped_land_count: number;
}
/**
 * 
 * @export
 * @interface ComboEntry
 */
export interface ComboEntry {
    /**
     * 
     */
    id: string;
    /**
     * 
     */
    card_names: Array<string>;
    /**
     * 
     */
    missing: Array<string>;
    /**
     * 
     */
    missing_oracle_id: string | null;
    /**
     * 
     */
    produces: Array<string>;
    /**
     * 
     */
    popularity: number;
    /**
     * 
     */
    bracket: string;
}
/**
 * 
 * @export
 * @interface CombosRequest
 */
export interface CombosRequest {
    /**
     * 
     */
    cards: Array<DeckEntry>;
    /**
     * 
     */
    card_names?: Array<string>;
    /**
     * 
     */
    limit?: number;
    /**
     * 
     */
    excluded?: Array<string>;
    /**
     * 
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     */
    identity?: Array<string> | null;
}
/**
 * 
 * @export
 * @interface CombosResponse
 */
export interface CombosResponse {
    /**
     * 
     */
    complete: Array<ComboEntry>;
    /**
     * 
     */
    one_short: Array<ComboEntry>;
    /**
     * 
     */
    notes: Array<string>;
}
/**
 * One card behind a count, and how much of that count it is.
 * 
 * Carries the amount rather than only the name because neither count is a
 * headcount: a bucket takes each card at its strongest role's weight, so
 * Storm-Kiln Artist is 0.7 of a ramp piece, and a type counts every copy, so
 * eight Mountains are eight of the Land row. A bare list of names would not
 * add up to the number it opens from — which is the one thing it is for.
 * @export
 * @interface CountedCard
 */
export interface CountedCard {
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    amount: number;
}
/**
 * 
 * @export
 * @interface CurveBucket
 */
export interface CurveBucket {
    /**
     * 
     */
    mv: number;
    /**
     * 
     */
    count: number;
    /**
     * 
     */
    target: number;
    /**
     * 
     */
    default_target?: number;
}
/**
 * One mana value's share of the deck's target curve.
 * 
 * A *share*, not a count, because a target is `share x spell count` and the
 * two sides of that product belong to different people: the builder owns the
 * shape, the deck owns how many spells there are. Shares that do not sum to
 * 1 are renormalised rather than refused — a shape is a shape whatever
 * arithmetic the client did — see `composition.apply_curve`.
 * @export
 * @interface CurvePoint
 */
export interface CurvePoint {
    /**
     * 
     */
    mv: number;
    /**
     * 
     */
    share: number;
}
/**
 * 
 * @export
 * @interface CutCandidate
 */
export interface CutCandidate {
    /**
     * 
     */
    oracle_id: string;
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    cmc?: number;
    /**
     * 
     */
    type_line?: string;
    /**
     * 
     */
    price_usd?: number | null;
    /**
     * 
     */
    playability?: number;
    /**
     * 
     */
    score?: number;
    /**
     * 
     */
    reasons?: Array<CutPhrase>;
}

/**
 * Why a card is offered as a cut. The frontend translates these.
 * @export
 */
export const CutCode = {
    bucket_crowded: 'bucket-crowded',
    combo_piece: 'combo-piece',
    excluded_theme: 'excluded-theme',
    improves_shape: 'improves-shape',
    rarely_played: 'rarely-played',
    staple: 'staple',
    stranded: 'stranded',
    supplies_scarce: 'supplies-scarce',
    tutor_floor: 'tutor-floor',
} as const;
export type CutCode = typeof CutCode[keyof typeof CutCode];

/**
 * A cut reason: a Phrase whose code is drawn from the closed set.
 * 
 * A separate subclass, not a narrowing of `Phrase.code` itself — `Phrase` is
 * the shared schema component `SuggestionReport.notes` also uses, and those
 * notes carry free-form codes.
 * @export
 * @interface CutPhrase
 */
export interface CutPhrase {
    /**
     * 
     */
    code: CutCode;
    /**
     * 
     */
    params?: { [key: string]: string | undefined; };
    /**
     * 
     */
    text: string;
}


/**
 * 
 * @export
 * @interface DeckEntry
 */
export interface DeckEntry {
    /**
     * 
     */
    oracle_id: string;
    /**
     * 
     */
    qty?: number;
}
/**
 * 
 * @export
 * @interface Diagnostics
 */
export interface Diagnostics {
    /**
     * 
     */
    deck_size: number;
    /**
     * 
     */
    resolved: number;
    /**
     * 
     */
    unresolved?: Array<string>;
    /**
     * 
     */
    speed: number;
    /**
     * 
     */
    template: string;
    /**
     * 
     */
    lands: number;
    /**
     * 
     */
    average_mv: number | null;
    /**
     * 
     */
    buckets: Array<BucketReport>;
    /**
     * 
     */
    curve: Array<CurveBucket>;
    /**
     * 
     */
    roles: { [key: string]: number | undefined; };
    /**
     * 
     */
    balance: Array<ResourceBalance>;
    /**
     * 
     */
    penalty: number;
    /**
     * 
     */
    types?: Array<TypeReport>;
    /**
     * 
     */
    type_source?: string;
    /**
     * 
     */
    themes?: Array<ThemeShare>;
    /**
     * 
     */
    consistency?: number;
    /**
     * 
     */
    themed_cards?: number;
    /**
     * 
     */
    typal?: Array<TypalShare>;
    /**
     * 
     */
    commander_anchored?: boolean;
    /**
     * 
     */
    interaction_grid?: InteractionGrid | null;
    /**
     * 
     */
    cedh_stats?: CedhStats | null;
    /**
     * 
     */
    cedh_class?: string | null;
    /**
     * 
     */
    meta_grade?: MetaGradeReport | null;
    /**
     * 
     */
    interaction_profile?: SceneInteractionProfile | null;
    /**
     * 
     */
    meta_profile_source?: string;
    /**
     * 
     */
    cedh_position?: AxesPosition | null;
}
/**
 * 
 * @export
 * @interface DiagnosticsRequest
 */
export interface DiagnosticsRequest {
    /**
     * 
     */
    cards: Array<DeckEntry>;
    /**
     * 
     */
    speed?: number;
    /**
     * 
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     */
    commander_oracle_id?: string | null;
    /**
     * 
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     */
    deck_size?: number;
    /**
     * 
     */
    expected_meta?: Array<string>;
}
/**
 * 
 * @export
 * @interface FillRequest
 */
export interface FillRequest {
    /**
     * 
     */
    cards: Array<DeckEntry>;
    /**
     * 
     */
    card_names?: Array<string>;
    /**
     * 
     */
    commander_oracle_id?: string | null;
    /**
     * 
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     */
    speed?: number;
    /**
     * 
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     */
    focus?: string | null;
    /**
     * 
     */
    theme_targets?: { [key: string]: number | undefined; };
    /**
     * 
     */
    deck_size?: number;
    /**
     * 
     */
    budget?: number | null;
    /**
     * 
     */
    pool_query?: string | null;
    /**
     * 
     */
    rejected?: Array<string>;
    /**
     * 
     */
    identity?: Array<string> | null;
}
/**
 * 
 * @export
 * @interface FillResult
 */
export interface FillResult {
    /**
     * 
     */
    status: string;
    /**
     * 
     */
    solved: boolean;
    /**
     * 
     */
    slots: number;
    /**
     * 
     */
    chosen?: Array<FilledCard>;
    /**
     * 
     */
    coverage?: { [key: string]: number | undefined; };
    /**
     * 
     */
    base_coverage?: { [key: string]: number | undefined; };
    /**
     * 
     */
    targets?: { [key: string]: Array<number> | undefined; };
    /**
     * 
     */
    total_price?: number;
    /**
     * 
     */
    solve_ms?: number;
    /**
     * 
     */
    notes?: Array<Phrase>;
}
/**
 * 
 * @export
 * @interface FilledCard
 */
export interface FilledCard {
    /**
     * 
     */
    oracle_id: string;
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    cmc: number;
    /**
     * 
     */
    score: number;
    /**
     * 
     */
    price_usd?: number | null;
}
/**
 * What the user asked to see more of.
 * @export
 * @interface Focus
 */
export interface Focus {
    /**
     * 
     */
    kind: string;
    /**
     * 
     */
    value: string;
    /**
     * 
     */
    label?: string;
}

/**
 * What hate class turns a line off, named by mechanism rather than by
 * card. Closed on purpose, like `vocabulary.py` — Task H's job is mapping
 * a class to real meta answers; this module only says which classes apply.
 * @export
 */
export const FoldClass = {
    graveyard: 'graveyard',
    activated_ability: 'activated_ability',
    triggered_ability: 'triggered_ability',
    etb: 'etb',
    cast_trigger: 'cast_trigger',
    artifact_dependent: 'artifact_dependent',
    creature_dependent: 'creature_dependent',
    enchantment_dependent: 'enchantment_dependent',
    library: 'library',
} as const;
export type FoldClass = typeof FoldClass[keyof typeof FoldClass];


/**
 * 
 * @export
 */
export const GradeStatus = {
    answered: 'answered',
    answered_only_by: 'answered_only_by',
    unanswered: 'unanswered',
} as const;
export type GradeStatus = typeof GradeStatus[keyof typeof GradeStatus];

/**
 * 
 * @export
 * @interface HTTPValidationError
 */
export interface HTTPValidationError {
    /**
     * 
     */
    detail?: Array<ValidationError>;
}
/**
 * One row/column intersection: how many cards, and which.
 * @export
 * @interface InteractionCell
 */
export interface InteractionCell {
    /**
     * 
     */
    count?: number;
    /**
     * 
     */
    cards?: Array<string>;
}
/**
 * 
 * @export
 * @interface InteractionGrid
 */
export interface InteractionGrid {
    /**
     * 
     */
    rows: Array<InteractionRow>;
}
/**
 * One row/column's decay-weighted mean count a top-cut deck holds.
 * @export
 * @interface InteractionProfileCell
 */
export interface InteractionProfileCell {
    /**
     * 
     */
    row: string;
    /**
     * 
     */
    column: string;
    /**
     * 
     */
    per_deck_mean: number;
}
/**
 * 
 * @export
 * @interface InteractionRow
 */
export interface InteractionRow {
    /**
     * 
     */
    row: string;
    /**
     * 
     */
    cells: { [key: string]: InteractionCell | undefined; };
    /**
     * 
     */
    available?: number | null;
    /**
     * 
     */
    classes?: { [key: string]: Array<string> | undefined; } | null;
}
/**
 * 
 * @export
 * @interface LineEntry
 */
export interface LineEntry {
    /**
     * 
     */
    id: string;
    /**
     * 
     */
    cards: Array<LinePieceEntry>;
    /**
     * 
     */
    mana_needed: string;
    /**
     * 
     */
    mana_value_needed: number;
    /**
     * 
     */
    deploy_cost: number;
    /**
     * 
     */
    deploy_cost_partial: boolean;
    /**
     * 
     */
    identity: Array<string>;
    /**
     * 
     */
    produces: Array<string>;
    /**
     * 
     */
    bracket_tag: string;
    /**
     * 
     */
    popularity: number;
    /**
     * 
     */
    prerequisites: LinePrerequisites;
    /**
     * 
     */
    folds_to: Array<string>;
    /**
     * 
     */
    complete: boolean;
    /**
     * 
     */
    missing: Array<string>;
    /**
     * 
     */
    win_through?: LineWinThroughEntry | null;
}
/**
 * 
 * @export
 * @interface LinePieceEntry
 */
export interface LinePieceEntry {
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    oracle_id: string;
    /**
     * 
     */
    zones: Array<string>;
    /**
     * 
     */
    must_be_commander: boolean;
    /**
     * 
     */
    in_deck: boolean;
}
/**
 * 
 * @export
 * @interface LinePrerequisites
 */
export interface LinePrerequisites {
    /**
     * 
     */
    easy: string;
    /**
     * 
     */
    notable: string;
}
/**
 * 
 * @export
 * @interface LineReportResponse
 */
export interface LineReportResponse {
    /**
     * 
     */
    lines: Array<LineEntry>;
    /**
     * 
     */
    tutor_map: Array<TutorMapEntry>;
    /**
     * 
     */
    redundancy: RedundancyBlock;
    /**
     * 
     */
    notes: Array<string>;
}
/**
 * Task I2's per-line win-through grade — `protected (N ways) vs an
 * expected M pieces of stack interaction at the table`, both numbers kept
 * apart on the wire exactly as `meta.LineWinThroughGrade` keeps them apart
 * in Python (never collapsed into one score).
 * @export
 * @interface LineWinThroughEntry
 */
export interface LineWinThroughEntry {
    /**
     * 
     */
    line_turn: number;
    /**
     * 
     */
    mana_left_after_line: number;
    /**
     * 
     */
    ways: Array<ProtectionWayEntry>;
    /**
     * 
     */
    excluded: Array<ProtectionWayEntry>;
    /**
     * 
     */
    protected_count: number;
    /**
     * 
     */
    expected_stack: number;
    /**
     * 
     */
    profile_source: string;
}
/**
 * Mirrors `CombosRequest` field for field — the line engine reads the
 * same deck-identity shape /combos does, just answers with more of it.
 * @export
 * @interface LinesRequest
 */
export interface LinesRequest {
    /**
     * 
     */
    cards: Array<DeckEntry>;
    /**
     * 
     */
    card_names?: Array<string>;
    /**
     * 
     */
    limit?: number;
    /**
     * 
     */
    excluded?: Array<string>;
    /**
     * 
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     */
    identity?: Array<string> | null;
    /**
     * 
     */
    speed?: number;
    /**
     * 
     */
    expected_meta?: Array<string>;
}
/**
 * 
 * @export
 * @interface LocationInner
 */
export interface LocationInner {
}
/**
 * 
 * @export
 * @interface MetaGradeReport
 */
export interface MetaGradeReport {
    /**
     * 
     */
    scene: string;
    /**
     * 
     */
    measured: string;
    /**
     * 
     */
    stale: boolean;
    /**
     * 
     */
    half_life_days: number;
    /**
     * 
     */
    grades: Array<ThreatGrade>;
}
/**
 * One measured threat: a complete combo line, its cost, its two
 * weights, and the fold classes (Task B) it belongs to.
 * @export
 * @interface MetaThreat
 */
export interface MetaThreat {
    /**
     * 
     */
    combo_id: string;
    /**
     * 
     */
    kind: ThreatKind;
    /**
     * 
     */
    cards: Array<string>;
    /**
     * 
     */
    produces: Array<string>;
    /**
     * 
     */
    mana_value_needed: number;
    /**
     * 
     */
    threat_turn: number;
    /**
     * 
     */
    deck_count: number;
    /**
     * 
     */
    meta_share: number;
    /**
     * 
     */
    folds_to: Set<FoldClass>;
}


/**
 * A sentence the backend composes and a UI is free to word itself.
 * 
 * `text` is the English rendering and stays authoritative for anything with
 * no translations to reach for — `cli.py` prints these, and a consumer given
 * a bare key instead of a sentence is worse off than one given English.
 * `code` and `params` are what a localised frontend uses instead; an unknown
 * code falls back to `text` rather than rendering a key at the reader.
 * 
 * Codes are stable identifiers, kebab-case, and must not be recycled: the
 * frontend keys off them, so reusing one for a different sentence silently
 * mistranslates rather than failing.
 * @export
 * @interface Phrase
 */
export interface Phrase {
    /**
     * 
     */
    code: string;
    /**
     * 
     */
    params?: { [key: string]: string | undefined; };
    /**
     * 
     */
    text: string;
}
/**
 * 
 * @export
 * @interface PoolQueryRequest
 */
export interface PoolQueryRequest {
    /**
     * 
     */
    query?: string;
}
/**
 * Whether a pool query compiles, and where it stops if it does not.
 * 
 * Required rather than defaulted: the handler always fills all three, and a
 * default would publish them as optional to the generated client.
 * @export
 * @interface PoolQueryResponse
 */
export interface PoolQueryResponse {
    /**
     * 
     */
    ok: boolean;
    /**
     * 
     */
    error: string | null;
    /**
     * 
     */
    position: number | null;
}
/**
 * 
 * @export
 * @interface ProtectionWayEntry
 */
export interface ProtectionWayEntry {
    /**
     * 
     */
    kind: string;
    /**
     * 
     */
    column: string;
    /**
     * 
     */
    count: number;
    /**
     * 
     */
    cards: Array<string>;
}
/**
 * 
 * @export
 * @interface Provenance
 */
export interface Provenance {
    /**
     * 
     */
    channel: string;
    /**
     * 
     */
    detail: string;
    /**
     * 
     */
    score: number;
    /**
     * 
     */
    code?: string;
    /**
     * 
     */
    params?: { [key: string]: string | undefined; };
    /**
     * 
     */
    key?: string | null;
}
/**
 * 
 * @export
 * @interface RedundancyBlock
 */
export interface RedundancyBlock {
    /**
     * 
     */
    shared_pieces: Array<SharedPieceWithLines>;
    /**
     * 
     */
    single_points: Array<SharedPieceEntry>;
}
/**
 * 
 * @export
 * @interface ReplaceRequest
 */
export interface ReplaceRequest {
    /**
     * 
     */
    cards: Array<DeckEntry>;
    /**
     * 
     */
    card_names?: Array<string>;
    /**
     * 
     */
    target_oracle_id: string;
    /**
     * 
     */
    commander_oracle_id?: string | null;
    /**
     * 
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     */
    speed?: number;
    /**
     * 
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     */
    theme_targets?: { [key: string]: number | undefined; };
    /**
     * 
     */
    limit?: number;
    /**
     * 
     */
    max_price?: number | null;
    /**
     * 
     */
    pool_query?: string | null;
    /**
     * 
     */
    excluded?: Array<string>;
    /**
     * 
     */
    identity?: Array<string> | null;
    /**
     * 
     */
    deck_size?: number;
}
/**
 * 
 * @export
 * @interface ReplaceResponse
 */
export interface ReplaceResponse {
    /**
     * 
     */
    target_name: string | null;
    /**
     * 
     */
    replacements: Array<Replacement>;
    /**
     * 
     */
    notes: Array<string>;
}
/**
 * 
 * @export
 * @interface Replacement
 */
export interface Replacement {
    /**
     * 
     */
    oracle_id: string;
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    cmc?: number;
    /**
     * 
     */
    type_line?: string;
    /**
     * 
     */
    price_usd?: number | null;
    /**
     * 
     */
    playability?: number;
    /**
     * 
     */
    game_changer?: boolean;
    /**
     * 
     */
    score?: number;
    /**
     * 
     */
    shared_roles?: Array<string>;
    /**
     * 
     */
    reasons?: Array<string>;
    /**
     * 
     */
    delta?: ShapeDelta | null;
}
/**
 * 
 * @export
 * @interface ResourceBalance
 */
export interface ResourceBalance {
    /**
     * 
     */
    resource: string;
    /**
     * 
     */
    produced: number;
    /**
     * 
     */
    wanted: number;
    /**
     * 
     */
    gap: number;
    /**
     * 
     */
    from_commander?: boolean;
    /**
     * 
     */
    produced_cards?: Array<string>;
    /**
     * 
     */
    wanted_cards?: Array<string>;
}
/**
 * The scene's measured interaction profile — `MetaThreatTable`'s
 * discipline: window, decks scanned, and the date measured travel beside
 * every number, and `per_table` is derived (never itself measured) from
 * `opponents`, the one constant that lets multiplayer into the arithmetic.
 * @export
 * @interface SceneInteractionProfile
 */
export interface SceneInteractionProfile {
    /**
     * 
     */
    scene: string;
    /**
     * 
     */
    measured: string;
    /**
     * 
     */
    window_start: string;
    /**
     * 
     */
    window_end: string;
    /**
     * 
     */
    half_life_days: number;
    /**
     * 
     */
    stale: boolean;
    /**
     * 
     */
    decks_scanned: number;
    /**
     * 
     */
    opponents: number;
    /**
     * 
     */
    cells: Array<InteractionProfileCell>;
    /**
     * 
     */
    stack_alarm_floor: number;
    /**
     * 
     */
    notes?: Array<string>;
}
/**
 * Graph-backed search. Every filter is an AND; values inside one are an OR.
 * @export
 * @interface SearchRequest
 */
export interface SearchRequest {
    /**
     * 
     */
    produces?: Array<string>;
    /**
     * 
     */
    cares_about?: Array<string>;
    /**
     * 
     */
    roles?: Array<string>;
    /**
     * 
     */
    creature_types?: Array<string>;
    /**
     * 
     */
    makes_types?: Array<string>;
    /**
     * 
     */
    cares_about_types?: Array<string>;
    /**
     * 
     */
    themes?: Array<string>;
    /**
     * 
     */
    identity?: Array<string> | null;
    /**
     * 
     */
    text?: string | null;
    /**
     * 
     */
    pool_query?: string | null;
    /**
     * 
     */
    max_price?: number | null;
    /**
     * 
     */
    min_playability?: number;
    /**
     * 
     */
    game_changers?: boolean | null;
    /**
     * 
     */
    exclude?: Array<string>;
    /**
     * 
     */
    sort?: string;
    /**
     * 
     */
    limit?: number;
}
/**
 * 
 * @export
 * @interface SearchResponse
 */
export interface SearchResponse {
    /**
     * 
     */
    results: Array<SearchResult>;
    /**
     * 
     */
    count: number;
}
/**
 * 
 * @export
 * @interface SearchResult
 */
export interface SearchResult {
    /**
     * 
     */
    oracle_id: string;
    /**
     * 
     */
    scryfall_id?: string | null;
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    mana_cost?: string;
    /**
     * 
     */
    cmc?: number;
    /**
     * 
     */
    type_line?: string;
    /**
     * 
     */
    color_identity?: Array<string>;
    /**
     * 
     */
    price_usd?: number | null;
    /**
     * 
     */
    price_eur?: number | null;
    /**
     * 
     */
    edhrec_rank?: number | null;
    /**
     * 
     */
    playability?: number;
    /**
     * 
     */
    game_changer?: boolean;
    /**
     * 
     */
    unreleased?: boolean;
}
/**
 * What a swap actually does to the deck.
 * 
 * The number that makes a suggestion checkable: not "this card is good" but
 * "this takes ramp from 10.2 to 10.9 and leaves everything else alone".
 * @export
 * @interface ShapeDelta
 */
export interface ShapeDelta {
    /**
     * 
     */
    penalty_before: number;
    /**
     * 
     */
    penalty_after: number;
    /**
     * 
     */
    buckets?: Array<BucketDelta>;
    /**
     * 
     */
    price_change?: number | null;
}
/**
 * 
 * @export
 * @interface SharedPieceEntry
 */
export interface SharedPieceEntry {
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    oracle_id: string;
}
/**
 * 
 * @export
 * @interface SharedPieceWithLines
 */
export interface SharedPieceWithLines {
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    oracle_id: string;
    /**
     * 
     */
    line_ids: Array<string>;
}
/**
 * 
 * @export
 * @interface Suggestion
 */
export interface Suggestion {
    /**
     * 
     */
    oracle_id: string;
    /**
     * 
     */
    name: string;
    /**
     * 
     */
    cmc: number;
    /**
     * 
     */
    type_line: string;
    /**
     * 
     */
    price_usd: number | null;
    /**
     * 
     */
    score: number;
    /**
     * 
     */
    provenance: Array<Provenance>;
    /**
     * 
     */
    playability?: number;
    /**
     * 
     */
    game_changer?: boolean;
}
/**
 * Suggestions gathered under the gap they close.
 * 
 * A flat ranked list answers "what could I add"; the question people actually
 * have is "what is my deck missing". The group carries the shortfall so the
 * heading states the case rather than just naming a category.
 * @export
 * @interface SuggestionGroup
 */
export interface SuggestionGroup {
    /**
     * 
     */
    key: string;
    /**
     * 
     */
    label: string;
    /**
     * 
     */
    reason: string;
    /**
     * 
     */
    suggestions: Array<Suggestion>;
}
/**
 * 
 * @export
 * @interface SuggestionReport
 */
export interface SuggestionReport {
    /**
     * 
     */
    commander: string | null;
    /**
     * 
     */
    commanders?: Array<string>;
    /**
     * 
     */
    commander_inferred: boolean;
    /**
     * 
     */
    identity: Array<string>;
    /**
     * 
     */
    considered: number;
    /**
     * 
     */
    suggestions: Array<Suggestion>;
    /**
     * 
     */
    groups?: Array<SuggestionGroup>;
    /**
     * 
     */
    focus?: Focus | null;
    /**
     * 
     */
    pinned?: Array<Focus>;
    /**
     * 
     */
    excluded?: Array<Focus>;
    /**
     * 
     */
    off_theme?: Array<ThemeLean>;
    /**
     * 
     */
    notes?: Array<Phrase>;
}
/**
 * 
 * @export
 * @interface SuggestionsRequest
 */
export interface SuggestionsRequest {
    /**
     * 
     */
    cards: Array<DeckEntry>;
    /**
     * 
     */
    card_names?: Array<string>;
    /**
     * 
     */
    commander_oracle_id?: string | null;
    /**
     * 
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     */
    limit?: number;
    /**
     * 
     */
    max_price?: number | null;
    /**
     * 
     */
    pool_query?: string | null;
    /**
     * 
     */
    speed?: number;
    /**
     * 
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     */
    focus?: string | null;
    /**
     * 
     */
    theme_targets?: { [key: string]: number | undefined; };
    /**
     * 
     */
    excluded?: Array<string>;
    /**
     * 
     */
    identity?: Array<string> | null;
    /**
     * 
     */
    deck_size?: number;
}
/**
 * One proposed exchange, with the shape change it causes.
 * @export
 * @interface Swap
 */
export interface Swap {
    /**
     * 
     */
    add_oracle_id: string;
    /**
     * 
     */
    add_name: string;
    /**
     * 
     */
    cut: CutCandidate;
    /**
     * 
     */
    shared_roles?: Array<string>;
    /**
     * 
     */
    frees?: Array<string>;
    /**
     * 
     */
    fills?: Array<string>;
    /**
     * 
     */
    upgrade?: boolean;
}
/**
 * 
 * @export
 * @interface SwapsRequest
 */
export interface SwapsRequest {
    /**
     * 
     */
    cards: Array<DeckEntry>;
    /**
     * 
     */
    card_names?: Array<string>;
    /**
     * 
     */
    commander_oracle_id?: string | null;
    /**
     * 
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     */
    speed?: number;
    /**
     * 
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     */
    focus?: string | null;
    /**
     * 
     */
    theme_targets?: { [key: string]: number | undefined; };
    /**
     * 
     */
    limit?: number;
    /**
     * 
     */
    per_add?: number;
    /**
     * 
     */
    max_price?: number | null;
    /**
     * 
     */
    pool_query?: string | null;
    /**
     * 
     */
    excluded?: Array<string>;
    /**
     * 
     */
    identity?: Array<string> | null;
    /**
     * 
     */
    deck_size?: number;
    /**
     * 
     */
    keep?: Array<string>;
}
/**
 * Adds, cuts, and the pairings between them.
 * 
 * Cuts are returned alongside the swaps rather than as the headline: the
 * product commitment is "to add X, cut one of these", never a standalone
 * ranking of someone's cards from worst to best.
 * @export
 * @interface SwapsResponse
 */
export interface SwapsResponse {
    /**
     * 
     */
    suggestions: SuggestionReport;
    /**
     * 
     */
    cuts: Array<CutCandidate>;
    /**
     * 
     */
    swaps: Array<Swap>;
}
/**
 * A theme the suggestions read as, that the deck itself does not play.
 * 
 * Offered so the reader can exclude it in one click. Not applied — the whole
 * point is that this is a judgement only the deck's owner can make, and an
 * off-theme build is a choice, not a mistake to be corrected.
 * @export
 * @interface ThemeLean
 */
export interface ThemeLean {
    /**
     * 
     */
    theme: string;
    /**
     * 
     */
    label: string;
    /**
     * 
     */
    share: number;
    /**
     * 
     */
    deck_share: number;
}
/**
 * 
 * @export
 * @interface ThemeShare
 */
export interface ThemeShare {
    /**
     * 
     */
    theme: string;
    /**
     * 
     */
    label: string;
    /**
     * 
     */
    share: number;
    /**
     * 
     */
    cards?: number;
}
/**
 * 
 * @export
 * @interface ThreatGrade
 */
export interface ThreatGrade {
    /**
     * 
     */
    threat: MetaThreat;
    /**
     * 
     */
    status: GradeStatus;
    /**
     * 
     */
    ways: Array<Way>;
    /**
     * 
     */
    excluded: Array<Way>;
}



/**
 * What kind of thing a meta threat is. Closed, per the task file: v1
 * implements `COMBO_LINE` only (Spellbook-backed — the corpus genuinely is
 * combo lines); `KEY_PERMANENT` (a format's engine-permanent class, e.g.
 * a Modern scene's The One Ring) and `PLAN` are carried in the schema now
 * so a second scene can add them without reshaping the response.
 * @export
 */
export const ThreatKind = {
    combo_line: 'combo_line',
    key_permanent: 'key_permanent',
    plan: 'plan',
} as const;
export type ThreatKind = typeof ThreatKind[keyof typeof ThreatKind];

/**
 * 
 * @export
 * @interface TutorMapEntry
 */
export interface TutorMapEntry {
    /**
     * 
     */
    tutor: string;
    /**
     * 
     */
    reaches: Array<string>;
}
/**
 * A creature type's share of the deck's typal identity.
 * 
 * Kept apart from `ThemeShare` rather than merged into one list. They come
 * from different axes and answer different questions — "what does this deck
 * do" against "what is it made of" — and a Goblin deck is usually also an
 * aristocrats or tokens deck. Merging them would force a card to choose.
 * @export
 * @interface TypalShare
 */
export interface TypalShare {
    /**
     * 
     */
    creature_type: string;
    /**
     * 
     */
    share: number;
    /**
     * 
     */
    bodies: number;
    /**
     * 
     */
    payoffs: number;
    /**
     * 
     */
    makes?: number;
}
/**
 * A user's edit to one primary type's target range.
 * 
 * The type axis is empirical — each corridor is one commander page's
 * measured distribution — but a measurement is still an offer: a deck that
 * runs thirty-four lands on purpose says so here, and every quota, cut and
 * fill is then graded against that number instead. Either bound may be
 * omitted, exactly as for a bucket.
 * @export
 * @interface TypeRange
 */
export interface TypeRange {
    /**
     * 
     */
    type: string;
    /**
     * 
     */
    low?: number | null;
    /**
     * 
     */
    high?: number | null;
}
/**
 * One primary type's count against its empirical target.
 * 
 * A third axis beside `BucketReport` and `CurveBucket`, kept separate
 * because it measures a different thing: the buckets are functional (a
 * creature can be ramp), the types are material — and a deck can sit
 * inside every functional quota while holding forty creatures.
 * @export
 * @interface TypeReport
 */
export interface TypeReport {
    /**
     * 
     */
    type: string;
    /**
     * 
     */
    count: number;
    /**
     * 
     */
    low: number;
    /**
     * 
     */
    high: number;
    /**
     * 
     */
    deviation: number;
    /**
     * 
     */
    status: string;
    /**
     * 
     */
    default_low?: number;
    /**
     * 
     */
    default_high?: number;
    /**
     * 
     */
    flexible?: number;
    /**
     * 
     */
    cards?: Array<CountedCard>;
}
/**
 * 
 * @export
 * @interface ValidationError
 */
export interface ValidationError {
    /**
     * 
     */
    loc: Array<LocationInner>;
    /**
     * 
     */
    msg: string;
    /**
     * 
     */
    type: string;
    /**
     * 
     */
    input?: any | null;
    /**
     * 
     */
    ctx?: object;
}
/**
 * 
 * @export
 * @interface WarmRequest
 */
export interface WarmRequest {
    /**
     * 
     */
    commander_oracle_id: string;
}
/**
 * One in-time (or, in `ThreatGrade.excluded`, timing-excluded) answer:
 * which interaction kind, at what grade, in which cost column, and which
 * named cards.
 * @export
 * @interface Way
 */
export interface Way {
    /**
     * 
     */
    kind: string;
    /**
     * 
     */
    grade: AnswerGrade;
    /**
     * 
     */
    column: string;
    /**
     * 
     */
    cards: Array<string>;
}


