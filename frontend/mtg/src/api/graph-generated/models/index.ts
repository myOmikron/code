/* tslint:disable */
/* eslint-disable */

/**
 * Whether one interaction row answers one fold class.
 * @export
 */
export const AnswerGrade = {
    answers: 'answers',
    partially: 'partially',
    no: 'no'
} as const;
export type AnswerGrade = typeof AnswerGrade[keyof typeof AnswerGrade];


/**
 * User-facing composition categories, shown on the diagnostics tab.
 * @export
 */
export const Bucket = {
    mana_sources: 'mana_sources',
    ramp: 'ramp',
    card_draw: 'card_draw',
    interaction: 'interaction',
    synergy_wincon: 'synergy_wincon'
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
     * @type {string}
     * @memberof BucketDelta
     */
    bucket: string;
    /**
     * 
     * @type {number}
     * @memberof BucketDelta
     */
    before: number;
    /**
     * 
     * @type {number}
     * @memberof BucketDelta
     */
    after: number;
    /**
     * 
     * @type {number}
     * @memberof BucketDelta
     */
    low: number;
    /**
     * 
     * @type {number}
     * @memberof BucketDelta
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
     * @type {Bucket}
     * @memberof BucketRange
     */
    bucket: Bucket;
    /**
     * 
     * @type {number}
     * @memberof BucketRange
     */
    low?: number | null;
    /**
     * 
     * @type {number}
     * @memberof BucketRange
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
     * @type {string}
     * @memberof BucketReport
     */
    bucket: string;
    /**
     * 
     * @type {number}
     * @memberof BucketReport
     */
    coverage: number;
    /**
     * 
     * @type {number}
     * @memberof BucketReport
     */
    low: number;
    /**
     * 
     * @type {number}
     * @memberof BucketReport
     */
    high: number;
    /**
     * 
     * @type {number}
     * @memberof BucketReport
     */
    deviation: number;
    /**
     * 
     * @type {string}
     * @memberof BucketReport
     */
    status: string;
    /**
     * 
     * @type {number}
     * @memberof BucketReport
     */
    default_low?: number;
    /**
     * 
     * @type {number}
     * @memberof BucketReport
     */
    default_high?: number;
    /**
     * 
     * @type {Array<CountedCard>}
     * @memberof BucketReport
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
     * @type {number}
     * @memberof CedhStats
     */
    fast_mana_count: number;
    /**
     * 
     * @type {number}
     * @memberof CedhStats
     */
    tutor_count: number;
    /**
     * 
     * @type {number}
     * @memberof CedhStats
     */
    free_spell_count: number;
    /**
     * 
     * @type {number}
     * @memberof CedhStats
     */
    mean_mana_value: number | null;
    /**
     * 
     * @type {number}
     * @memberof CedhStats
     */
    land_count: number;
    /**
     * 
     * @type {number}
     * @memberof CedhStats
     */
    untapped_land_count: number;
    /**
     * 
     * @type {number}
     * @memberof CedhStats
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
     * @type {string}
     * @memberof ComboEntry
     */
    id: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof ComboEntry
     */
    card_names: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof ComboEntry
     */
    missing: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof ComboEntry
     */
    missing_oracle_id: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof ComboEntry
     */
    produces: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof ComboEntry
     */
    popularity: number;
    /**
     * 
     * @type {string}
     * @memberof ComboEntry
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
     * @type {Array<DeckEntry>}
     * @memberof CombosRequest
     */
    cards: Array<DeckEntry>;
    /**
     * 
     * @type {Array<string>}
     * @memberof CombosRequest
     */
    card_names?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof CombosRequest
     */
    limit?: number;
    /**
     * 
     * @type {Array<string>}
     * @memberof CombosRequest
     */
    excluded?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof CombosRequest
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof CombosRequest
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
     * @type {Array<ComboEntry>}
     * @memberof CombosResponse
     */
    complete: Array<ComboEntry>;
    /**
     * 
     * @type {Array<ComboEntry>}
     * @memberof CombosResponse
     */
    one_short: Array<ComboEntry>;
    /**
     * 
     * @type {Array<string>}
     * @memberof CombosResponse
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
     * @type {string}
     * @memberof CountedCard
     */
    name: string;
    /**
     * 
     * @type {number}
     * @memberof CountedCard
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
     * @type {number}
     * @memberof CurveBucket
     */
    mv: number;
    /**
     * 
     * @type {number}
     * @memberof CurveBucket
     */
    count: number;
    /**
     * 
     * @type {number}
     * @memberof CurveBucket
     */
    target: number;
    /**
     * 
     * @type {number}
     * @memberof CurveBucket
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
     * @type {number}
     * @memberof CurvePoint
     */
    mv: number;
    /**
     * 
     * @type {number}
     * @memberof CurvePoint
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
     * @type {string}
     * @memberof CutCandidate
     */
    oracle_id: string;
    /**
     * 
     * @type {string}
     * @memberof CutCandidate
     */
    name: string;
    /**
     * 
     * @type {number}
     * @memberof CutCandidate
     */
    cmc?: number;
    /**
     * 
     * @type {string}
     * @memberof CutCandidate
     */
    type_line?: string;
    /**
     * 
     * @type {number}
     * @memberof CutCandidate
     */
    price_usd?: number | null;
    /**
     * 
     * @type {number}
     * @memberof CutCandidate
     */
    playability?: number;
    /**
     * 
     * @type {number}
     * @memberof CutCandidate
     */
    score?: number;
    /**
     * 
     * @type {Array<CutPhrase>}
     * @memberof CutCandidate
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
    tutor_floor: 'tutor-floor'
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
     * @type {CutCode}
     * @memberof CutPhrase
     */
    code: CutCode;
    /**
     * 
     * @type {{ [key: string]: string | undefined; }}
     * @memberof CutPhrase
     */
    params?: { [key: string]: string | undefined; };
    /**
     * 
     * @type {string}
     * @memberof CutPhrase
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
     * @type {string}
     * @memberof DeckEntry
     */
    oracle_id: string;
    /**
     * 
     * @type {number}
     * @memberof DeckEntry
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
     * @type {number}
     * @memberof Diagnostics
     */
    deck_size: number;
    /**
     * 
     * @type {number}
     * @memberof Diagnostics
     */
    resolved: number;
    /**
     * 
     * @type {Array<string>}
     * @memberof Diagnostics
     */
    unresolved?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof Diagnostics
     */
    speed: number;
    /**
     * 
     * @type {string}
     * @memberof Diagnostics
     */
    template: string;
    /**
     * 
     * @type {number}
     * @memberof Diagnostics
     */
    lands: number;
    /**
     * 
     * @type {number}
     * @memberof Diagnostics
     */
    average_mv: number | null;
    /**
     * 
     * @type {Array<BucketReport>}
     * @memberof Diagnostics
     */
    buckets: Array<BucketReport>;
    /**
     * 
     * @type {Array<CurveBucket>}
     * @memberof Diagnostics
     */
    curve: Array<CurveBucket>;
    /**
     * 
     * @type {{ [key: string]: number | undefined; }}
     * @memberof Diagnostics
     */
    roles: { [key: string]: number | undefined; };
    /**
     * 
     * @type {Array<ResourceBalance>}
     * @memberof Diagnostics
     */
    balance: Array<ResourceBalance>;
    /**
     * 
     * @type {number}
     * @memberof Diagnostics
     */
    penalty: number;
    /**
     * 
     * @type {Array<TypeReport>}
     * @memberof Diagnostics
     */
    types?: Array<TypeReport>;
    /**
     * 
     * @type {string}
     * @memberof Diagnostics
     */
    type_source?: string;
    /**
     * 
     * @type {Array<ThemeShare>}
     * @memberof Diagnostics
     */
    themes?: Array<ThemeShare>;
    /**
     * 
     * @type {number}
     * @memberof Diagnostics
     */
    consistency?: number;
    /**
     * 
     * @type {number}
     * @memberof Diagnostics
     */
    themed_cards?: number;
    /**
     * 
     * @type {Array<TypalShare>}
     * @memberof Diagnostics
     */
    typal?: Array<TypalShare>;
    /**
     * 
     * @type {boolean}
     * @memberof Diagnostics
     */
    commander_anchored?: boolean;
    /**
     * 
     * @type {InteractionGrid}
     * @memberof Diagnostics
     */
    interaction_grid?: InteractionGrid | null;
    /**
     * 
     * @type {CedhStats}
     * @memberof Diagnostics
     */
    cedh_stats?: CedhStats | null;
    /**
     * 
     * @type {string}
     * @memberof Diagnostics
     */
    cedh_class?: string | null;
    /**
     * 
     * @type {MetaGradeReport}
     * @memberof Diagnostics
     */
    meta_grade?: MetaGradeReport | null;
}
/**
 * 
 * @export
 * @interface DiagnosticsRequest
 */
export interface DiagnosticsRequest {
    /**
     * 
     * @type {Array<DeckEntry>}
     * @memberof DiagnosticsRequest
     */
    cards: Array<DeckEntry>;
    /**
     * 
     * @type {number}
     * @memberof DiagnosticsRequest
     */
    speed?: number;
    /**
     * 
     * @type {Array<BucketRange>}
     * @memberof DiagnosticsRequest
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     * @type {Array<CurvePoint>}
     * @memberof DiagnosticsRequest
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     * @type {Array<TypeRange>}
     * @memberof DiagnosticsRequest
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     * @type {string}
     * @memberof DiagnosticsRequest
     */
    commander_oracle_id?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof DiagnosticsRequest
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof DiagnosticsRequest
     */
    deck_size?: number;
}
/**
 * 
 * @export
 * @interface FillRequest
 */
export interface FillRequest {
    /**
     * 
     * @type {Array<DeckEntry>}
     * @memberof FillRequest
     */
    cards: Array<DeckEntry>;
    /**
     * 
     * @type {Array<string>}
     * @memberof FillRequest
     */
    card_names?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof FillRequest
     */
    commander_oracle_id?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof FillRequest
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof FillRequest
     */
    speed?: number;
    /**
     * 
     * @type {Array<BucketRange>}
     * @memberof FillRequest
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     * @type {Array<CurvePoint>}
     * @memberof FillRequest
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     * @type {Array<TypeRange>}
     * @memberof FillRequest
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     * @type {string}
     * @memberof FillRequest
     */
    focus?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof FillRequest
     */
    pinned_themes?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof FillRequest
     */
    excluded_themes?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof FillRequest
     */
    deck_size?: number;
    /**
     * 
     * @type {number}
     * @memberof FillRequest
     */
    budget?: number | null;
    /**
     * 
     * @type {string}
     * @memberof FillRequest
     */
    pool_query?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof FillRequest
     */
    rejected?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof FillRequest
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
     * @type {string}
     * @memberof FillResult
     */
    status: string;
    /**
     * 
     * @type {boolean}
     * @memberof FillResult
     */
    solved: boolean;
    /**
     * 
     * @type {number}
     * @memberof FillResult
     */
    slots: number;
    /**
     * 
     * @type {Array<FilledCard>}
     * @memberof FillResult
     */
    chosen?: Array<FilledCard>;
    /**
     * 
     * @type {{ [key: string]: number | undefined; }}
     * @memberof FillResult
     */
    coverage?: { [key: string]: number | undefined; };
    /**
     * 
     * @type {{ [key: string]: number | undefined; }}
     * @memberof FillResult
     */
    base_coverage?: { [key: string]: number | undefined; };
    /**
     * 
     * @type {{ [key: string]: Array<number> | undefined; }}
     * @memberof FillResult
     */
    targets?: { [key: string]: Array<number> | undefined; };
    /**
     * 
     * @type {number}
     * @memberof FillResult
     */
    total_price?: number;
    /**
     * 
     * @type {number}
     * @memberof FillResult
     */
    solve_ms?: number;
    /**
     * 
     * @type {Array<Phrase>}
     * @memberof FillResult
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
     * @type {string}
     * @memberof FilledCard
     */
    oracle_id: string;
    /**
     * 
     * @type {string}
     * @memberof FilledCard
     */
    name: string;
    /**
     * 
     * @type {number}
     * @memberof FilledCard
     */
    cmc: number;
    /**
     * 
     * @type {number}
     * @memberof FilledCard
     */
    score: number;
    /**
     * 
     * @type {number}
     * @memberof FilledCard
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
     * @type {string}
     * @memberof Focus
     */
    kind: string;
    /**
     * 
     * @type {string}
     * @memberof Focus
     */
    value: string;
    /**
     * 
     * @type {string}
     * @memberof Focus
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
    library: 'library'
} as const;
export type FoldClass = typeof FoldClass[keyof typeof FoldClass];


/**
 * 
 * @export
 */
export const GradeStatus = {
    answered: 'answered',
    answered_only_by: 'answered_only_by',
    unanswered: 'unanswered'
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
     * @type {Array<ValidationError>}
     * @memberof HTTPValidationError
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
     * @type {number}
     * @memberof InteractionCell
     */
    count?: number;
    /**
     * 
     * @type {Array<string>}
     * @memberof InteractionCell
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
     * @type {Array<InteractionRow>}
     * @memberof InteractionGrid
     */
    rows: Array<InteractionRow>;
}
/**
 * 
 * @export
 * @interface InteractionRow
 */
export interface InteractionRow {
    /**
     * 
     * @type {string}
     * @memberof InteractionRow
     */
    row: string;
    /**
     * 
     * @type {{ [key: string]: InteractionCell | undefined; }}
     * @memberof InteractionRow
     */
    cells: { [key: string]: InteractionCell | undefined; };
    /**
     * 
     * @type {{ [key: string]: Array<string> | undefined; }}
     * @memberof InteractionRow
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
     * @type {string}
     * @memberof LineEntry
     */
    id: string;
    /**
     * 
     * @type {Array<LinePieceEntry>}
     * @memberof LineEntry
     */
    cards: Array<LinePieceEntry>;
    /**
     * 
     * @type {string}
     * @memberof LineEntry
     */
    mana_needed: string;
    /**
     * 
     * @type {number}
     * @memberof LineEntry
     */
    mana_value_needed: number;
    /**
     * 
     * @type {Array<string>}
     * @memberof LineEntry
     */
    identity: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof LineEntry
     */
    produces: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof LineEntry
     */
    bracket_tag: string;
    /**
     * 
     * @type {number}
     * @memberof LineEntry
     */
    popularity: number;
    /**
     * 
     * @type {LinePrerequisites}
     * @memberof LineEntry
     */
    prerequisites: LinePrerequisites;
    /**
     * 
     * @type {Array<string>}
     * @memberof LineEntry
     */
    folds_to: Array<string>;
    /**
     * 
     * @type {boolean}
     * @memberof LineEntry
     */
    complete: boolean;
    /**
     * 
     * @type {Array<string>}
     * @memberof LineEntry
     */
    missing: Array<string>;
}
/**
 * 
 * @export
 * @interface LinePieceEntry
 */
export interface LinePieceEntry {
    /**
     * 
     * @type {string}
     * @memberof LinePieceEntry
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof LinePieceEntry
     */
    oracle_id: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof LinePieceEntry
     */
    zones: Array<string>;
    /**
     * 
     * @type {boolean}
     * @memberof LinePieceEntry
     */
    must_be_commander: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof LinePieceEntry
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
     * @type {string}
     * @memberof LinePrerequisites
     */
    easy: string;
    /**
     * 
     * @type {string}
     * @memberof LinePrerequisites
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
     * @type {Array<LineEntry>}
     * @memberof LineReportResponse
     */
    lines: Array<LineEntry>;
    /**
     * 
     * @type {Array<TutorMapEntry>}
     * @memberof LineReportResponse
     */
    tutor_map: Array<TutorMapEntry>;
    /**
     * 
     * @type {RedundancyBlock}
     * @memberof LineReportResponse
     */
    redundancy: RedundancyBlock;
    /**
     * 
     * @type {Array<string>}
     * @memberof LineReportResponse
     */
    notes: Array<string>;
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
     * @type {Array<DeckEntry>}
     * @memberof LinesRequest
     */
    cards: Array<DeckEntry>;
    /**
     * 
     * @type {Array<string>}
     * @memberof LinesRequest
     */
    card_names?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof LinesRequest
     */
    limit?: number;
    /**
     * 
     * @type {Array<string>}
     * @memberof LinesRequest
     */
    excluded?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof LinesRequest
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof LinesRequest
     */
    identity?: Array<string> | null;
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
     * @type {string}
     * @memberof MetaGradeReport
     */
    scene: string;
    /**
     * 
     * @type {string}
     * @memberof MetaGradeReport
     */
    measured: string;
    /**
     * 
     * @type {boolean}
     * @memberof MetaGradeReport
     */
    stale: boolean;
    /**
     * 
     * @type {number}
     * @memberof MetaGradeReport
     */
    half_life_days: number;
    /**
     * 
     * @type {Array<ThreatGrade>}
     * @memberof MetaGradeReport
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
     * @type {string}
     * @memberof MetaThreat
     */
    combo_id: string;
    /**
     * 
     * @type {ThreatKind}
     * @memberof MetaThreat
     */
    kind: ThreatKind;
    /**
     * 
     * @type {Array<string>}
     * @memberof MetaThreat
     */
    cards: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof MetaThreat
     */
    produces: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof MetaThreat
     */
    mana_value_needed: number;
    /**
     * 
     * @type {number}
     * @memberof MetaThreat
     */
    threat_turn: number;
    /**
     * 
     * @type {number}
     * @memberof MetaThreat
     */
    deck_count: number;
    /**
     * 
     * @type {number}
     * @memberof MetaThreat
     */
    meta_share: number;
    /**
     * 
     * @type {Set<FoldClass>}
     * @memberof MetaThreat
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
     * @type {string}
     * @memberof Phrase
     */
    code: string;
    /**
     * 
     * @type {{ [key: string]: string | undefined; }}
     * @memberof Phrase
     */
    params?: { [key: string]: string | undefined; };
    /**
     * 
     * @type {string}
     * @memberof Phrase
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
     * @type {string}
     * @memberof PoolQueryRequest
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
     * @type {boolean}
     * @memberof PoolQueryResponse
     */
    ok: boolean;
    /**
     * 
     * @type {string}
     * @memberof PoolQueryResponse
     */
    error: string | null;
    /**
     * 
     * @type {number}
     * @memberof PoolQueryResponse
     */
    position: number | null;
}
/**
 * 
 * @export
 * @interface Provenance
 */
export interface Provenance {
    /**
     * 
     * @type {string}
     * @memberof Provenance
     */
    channel: string;
    /**
     * 
     * @type {string}
     * @memberof Provenance
     */
    detail: string;
    /**
     * 
     * @type {number}
     * @memberof Provenance
     */
    score: number;
    /**
     * 
     * @type {string}
     * @memberof Provenance
     */
    code?: string;
    /**
     * 
     * @type {{ [key: string]: string | undefined; }}
     * @memberof Provenance
     */
    params?: { [key: string]: string | undefined; };
    /**
     * 
     * @type {string}
     * @memberof Provenance
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
     * @type {Array<SharedPieceWithLines>}
     * @memberof RedundancyBlock
     */
    shared_pieces: Array<SharedPieceWithLines>;
    /**
     * 
     * @type {Array<SharedPieceEntry>}
     * @memberof RedundancyBlock
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
     * @type {Array<DeckEntry>}
     * @memberof ReplaceRequest
     */
    cards: Array<DeckEntry>;
    /**
     * 
     * @type {Array<string>}
     * @memberof ReplaceRequest
     */
    card_names?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof ReplaceRequest
     */
    target_oracle_id: string;
    /**
     * 
     * @type {string}
     * @memberof ReplaceRequest
     */
    commander_oracle_id?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof ReplaceRequest
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof ReplaceRequest
     */
    speed?: number;
    /**
     * 
     * @type {Array<BucketRange>}
     * @memberof ReplaceRequest
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     * @type {Array<CurvePoint>}
     * @memberof ReplaceRequest
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     * @type {Array<TypeRange>}
     * @memberof ReplaceRequest
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     * @type {Array<string>}
     * @memberof ReplaceRequest
     */
    pinned_themes?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof ReplaceRequest
     */
    excluded_themes?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof ReplaceRequest
     */
    limit?: number;
    /**
     * 
     * @type {number}
     * @memberof ReplaceRequest
     */
    max_price?: number | null;
    /**
     * 
     * @type {string}
     * @memberof ReplaceRequest
     */
    pool_query?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof ReplaceRequest
     */
    excluded?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof ReplaceRequest
     */
    identity?: Array<string> | null;
    /**
     * 
     * @type {number}
     * @memberof ReplaceRequest
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
     * @type {string}
     * @memberof ReplaceResponse
     */
    target_name: string | null;
    /**
     * 
     * @type {Array<Replacement>}
     * @memberof ReplaceResponse
     */
    replacements: Array<Replacement>;
    /**
     * 
     * @type {Array<string>}
     * @memberof ReplaceResponse
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
     * @type {string}
     * @memberof Replacement
     */
    oracle_id: string;
    /**
     * 
     * @type {string}
     * @memberof Replacement
     */
    name: string;
    /**
     * 
     * @type {number}
     * @memberof Replacement
     */
    cmc?: number;
    /**
     * 
     * @type {string}
     * @memberof Replacement
     */
    type_line?: string;
    /**
     * 
     * @type {number}
     * @memberof Replacement
     */
    price_usd?: number | null;
    /**
     * 
     * @type {number}
     * @memberof Replacement
     */
    playability?: number;
    /**
     * 
     * @type {boolean}
     * @memberof Replacement
     */
    game_changer?: boolean;
    /**
     * 
     * @type {number}
     * @memberof Replacement
     */
    score?: number;
    /**
     * 
     * @type {Array<string>}
     * @memberof Replacement
     */
    shared_roles?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof Replacement
     */
    reasons?: Array<string>;
    /**
     * 
     * @type {ShapeDelta}
     * @memberof Replacement
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
     * @type {string}
     * @memberof ResourceBalance
     */
    resource: string;
    /**
     * 
     * @type {number}
     * @memberof ResourceBalance
     */
    produced: number;
    /**
     * 
     * @type {number}
     * @memberof ResourceBalance
     */
    wanted: number;
    /**
     * 
     * @type {number}
     * @memberof ResourceBalance
     */
    gap: number;
    /**
     * 
     * @type {boolean}
     * @memberof ResourceBalance
     */
    from_commander?: boolean;
    /**
     * 
     * @type {Array<string>}
     * @memberof ResourceBalance
     */
    produced_cards?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof ResourceBalance
     */
    wanted_cards?: Array<string>;
}
/**
 * Graph-backed search. Every filter is an AND; values inside one are an OR.
 * @export
 * @interface SearchRequest
 */
export interface SearchRequest {
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    produces?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    cares_about?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    roles?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    creature_types?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    makes_types?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    cares_about_types?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    themes?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    identity?: Array<string> | null;
    /**
     * 
     * @type {string}
     * @memberof SearchRequest
     */
    text?: string | null;
    /**
     * 
     * @type {string}
     * @memberof SearchRequest
     */
    pool_query?: string | null;
    /**
     * 
     * @type {number}
     * @memberof SearchRequest
     */
    max_price?: number | null;
    /**
     * 
     * @type {number}
     * @memberof SearchRequest
     */
    min_playability?: number;
    /**
     * 
     * @type {boolean}
     * @memberof SearchRequest
     */
    game_changers?: boolean | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchRequest
     */
    exclude?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof SearchRequest
     */
    sort?: string;
    /**
     * 
     * @type {number}
     * @memberof SearchRequest
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
     * @type {Array<SearchResult>}
     * @memberof SearchResponse
     */
    results: Array<SearchResult>;
    /**
     * 
     * @type {number}
     * @memberof SearchResponse
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
     * @type {string}
     * @memberof SearchResult
     */
    oracle_id: string;
    /**
     * 
     * @type {string}
     * @memberof SearchResult
     */
    scryfall_id?: string | null;
    /**
     * 
     * @type {string}
     * @memberof SearchResult
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof SearchResult
     */
    mana_cost?: string;
    /**
     * 
     * @type {number}
     * @memberof SearchResult
     */
    cmc?: number;
    /**
     * 
     * @type {string}
     * @memberof SearchResult
     */
    type_line?: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof SearchResult
     */
    color_identity?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof SearchResult
     */
    price_usd?: number | null;
    /**
     * 
     * @type {number}
     * @memberof SearchResult
     */
    price_eur?: number | null;
    /**
     * 
     * @type {number}
     * @memberof SearchResult
     */
    edhrec_rank?: number | null;
    /**
     * 
     * @type {number}
     * @memberof SearchResult
     */
    playability?: number;
    /**
     * 
     * @type {boolean}
     * @memberof SearchResult
     */
    game_changer?: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof SearchResult
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
     * @type {number}
     * @memberof ShapeDelta
     */
    penalty_before: number;
    /**
     * 
     * @type {number}
     * @memberof ShapeDelta
     */
    penalty_after: number;
    /**
     * 
     * @type {Array<BucketDelta>}
     * @memberof ShapeDelta
     */
    buckets?: Array<BucketDelta>;
    /**
     * 
     * @type {number}
     * @memberof ShapeDelta
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
     * @type {string}
     * @memberof SharedPieceEntry
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof SharedPieceEntry
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
     * @type {string}
     * @memberof SharedPieceWithLines
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof SharedPieceWithLines
     */
    oracle_id: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof SharedPieceWithLines
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
     * @type {string}
     * @memberof Suggestion
     */
    oracle_id: string;
    /**
     * 
     * @type {string}
     * @memberof Suggestion
     */
    name: string;
    /**
     * 
     * @type {number}
     * @memberof Suggestion
     */
    cmc: number;
    /**
     * 
     * @type {string}
     * @memberof Suggestion
     */
    type_line: string;
    /**
     * 
     * @type {number}
     * @memberof Suggestion
     */
    price_usd: number | null;
    /**
     * 
     * @type {number}
     * @memberof Suggestion
     */
    score: number;
    /**
     * 
     * @type {Array<Provenance>}
     * @memberof Suggestion
     */
    provenance: Array<Provenance>;
    /**
     * 
     * @type {number}
     * @memberof Suggestion
     */
    playability?: number;
    /**
     * 
     * @type {boolean}
     * @memberof Suggestion
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
     * @type {string}
     * @memberof SuggestionGroup
     */
    key: string;
    /**
     * 
     * @type {string}
     * @memberof SuggestionGroup
     */
    label: string;
    /**
     * 
     * @type {string}
     * @memberof SuggestionGroup
     */
    reason: string;
    /**
     * 
     * @type {Array<Suggestion>}
     * @memberof SuggestionGroup
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
     * @type {string}
     * @memberof SuggestionReport
     */
    commander: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof SuggestionReport
     */
    commanders?: Array<string>;
    /**
     * 
     * @type {boolean}
     * @memberof SuggestionReport
     */
    commander_inferred: boolean;
    /**
     * 
     * @type {Array<string>}
     * @memberof SuggestionReport
     */
    identity: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof SuggestionReport
     */
    considered: number;
    /**
     * 
     * @type {Array<Suggestion>}
     * @memberof SuggestionReport
     */
    suggestions: Array<Suggestion>;
    /**
     * 
     * @type {Array<SuggestionGroup>}
     * @memberof SuggestionReport
     */
    groups?: Array<SuggestionGroup>;
    /**
     * 
     * @type {Focus}
     * @memberof SuggestionReport
     */
    focus?: Focus | null;
    /**
     * 
     * @type {Array<Focus>}
     * @memberof SuggestionReport
     */
    pinned?: Array<Focus>;
    /**
     * 
     * @type {Array<Focus>}
     * @memberof SuggestionReport
     */
    excluded?: Array<Focus>;
    /**
     * 
     * @type {Array<ThemeLean>}
     * @memberof SuggestionReport
     */
    off_theme?: Array<ThemeLean>;
    /**
     * 
     * @type {Array<Phrase>}
     * @memberof SuggestionReport
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
     * @type {Array<DeckEntry>}
     * @memberof SuggestionsRequest
     */
    cards: Array<DeckEntry>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SuggestionsRequest
     */
    card_names?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof SuggestionsRequest
     */
    commander_oracle_id?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof SuggestionsRequest
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof SuggestionsRequest
     */
    limit?: number;
    /**
     * 
     * @type {number}
     * @memberof SuggestionsRequest
     */
    max_price?: number | null;
    /**
     * 
     * @type {string}
     * @memberof SuggestionsRequest
     */
    pool_query?: string | null;
    /**
     * 
     * @type {number}
     * @memberof SuggestionsRequest
     */
    speed?: number;
    /**
     * 
     * @type {Array<BucketRange>}
     * @memberof SuggestionsRequest
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     * @type {Array<CurvePoint>}
     * @memberof SuggestionsRequest
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     * @type {Array<TypeRange>}
     * @memberof SuggestionsRequest
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     * @type {string}
     * @memberof SuggestionsRequest
     */
    focus?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof SuggestionsRequest
     */
    pinned_themes?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SuggestionsRequest
     */
    excluded_themes?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SuggestionsRequest
     */
    excluded?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SuggestionsRequest
     */
    identity?: Array<string> | null;
    /**
     * 
     * @type {number}
     * @memberof SuggestionsRequest
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
     * @type {string}
     * @memberof Swap
     */
    add_oracle_id: string;
    /**
     * 
     * @type {string}
     * @memberof Swap
     */
    add_name: string;
    /**
     * 
     * @type {CutCandidate}
     * @memberof Swap
     */
    cut: CutCandidate;
    /**
     * 
     * @type {Array<string>}
     * @memberof Swap
     */
    shared_roles?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof Swap
     */
    frees?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof Swap
     */
    fills?: Array<string>;
    /**
     * 
     * @type {boolean}
     * @memberof Swap
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
     * @type {Array<DeckEntry>}
     * @memberof SwapsRequest
     */
    cards: Array<DeckEntry>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SwapsRequest
     */
    card_names?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof SwapsRequest
     */
    commander_oracle_id?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof SwapsRequest
     */
    commander_oracle_ids?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof SwapsRequest
     */
    speed?: number;
    /**
     * 
     * @type {Array<BucketRange>}
     * @memberof SwapsRequest
     */
    overrides?: Array<BucketRange>;
    /**
     * 
     * @type {Array<CurvePoint>}
     * @memberof SwapsRequest
     */
    curve?: Array<CurvePoint>;
    /**
     * 
     * @type {Array<TypeRange>}
     * @memberof SwapsRequest
     */
    type_overrides?: Array<TypeRange>;
    /**
     * 
     * @type {string}
     * @memberof SwapsRequest
     */
    focus?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof SwapsRequest
     */
    pinned_themes?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SwapsRequest
     */
    excluded_themes?: Array<string>;
    /**
     * 
     * @type {number}
     * @memberof SwapsRequest
     */
    limit?: number;
    /**
     * 
     * @type {number}
     * @memberof SwapsRequest
     */
    per_add?: number;
    /**
     * 
     * @type {number}
     * @memberof SwapsRequest
     */
    max_price?: number | null;
    /**
     * 
     * @type {string}
     * @memberof SwapsRequest
     */
    pool_query?: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof SwapsRequest
     */
    excluded?: Array<string>;
    /**
     * 
     * @type {Array<string>}
     * @memberof SwapsRequest
     */
    identity?: Array<string> | null;
    /**
     * 
     * @type {number}
     * @memberof SwapsRequest
     */
    deck_size?: number;
    /**
     * 
     * @type {Array<string>}
     * @memberof SwapsRequest
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
     * @type {SuggestionReport}
     * @memberof SwapsResponse
     */
    suggestions: SuggestionReport;
    /**
     * 
     * @type {Array<CutCandidate>}
     * @memberof SwapsResponse
     */
    cuts: Array<CutCandidate>;
    /**
     * 
     * @type {Array<Swap>}
     * @memberof SwapsResponse
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
     * @type {string}
     * @memberof ThemeLean
     */
    theme: string;
    /**
     * 
     * @type {string}
     * @memberof ThemeLean
     */
    label: string;
    /**
     * 
     * @type {number}
     * @memberof ThemeLean
     */
    share: number;
    /**
     * 
     * @type {number}
     * @memberof ThemeLean
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
     * @type {string}
     * @memberof ThemeShare
     */
    theme: string;
    /**
     * 
     * @type {string}
     * @memberof ThemeShare
     */
    label: string;
    /**
     * 
     * @type {number}
     * @memberof ThemeShare
     */
    share: number;
    /**
     * 
     * @type {number}
     * @memberof ThemeShare
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
     * @type {MetaThreat}
     * @memberof ThreatGrade
     */
    threat: MetaThreat;
    /**
     * 
     * @type {GradeStatus}
     * @memberof ThreatGrade
     */
    status: GradeStatus;
    /**
     * 
     * @type {Array<Way>}
     * @memberof ThreatGrade
     */
    ways: Array<Way>;
    /**
     * 
     * @type {Array<Way>}
     * @memberof ThreatGrade
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
    plan: 'plan'
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
     * @type {string}
     * @memberof TutorMapEntry
     */
    tutor: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof TutorMapEntry
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
     * @type {string}
     * @memberof TypalShare
     */
    creature_type: string;
    /**
     * 
     * @type {number}
     * @memberof TypalShare
     */
    share: number;
    /**
     * 
     * @type {number}
     * @memberof TypalShare
     */
    bodies: number;
    /**
     * 
     * @type {number}
     * @memberof TypalShare
     */
    payoffs: number;
    /**
     * 
     * @type {number}
     * @memberof TypalShare
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
     * @type {string}
     * @memberof TypeRange
     */
    type: string;
    /**
     * 
     * @type {number}
     * @memberof TypeRange
     */
    low?: number | null;
    /**
     * 
     * @type {number}
     * @memberof TypeRange
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
     * @type {string}
     * @memberof TypeReport
     */
    type: string;
    /**
     * 
     * @type {number}
     * @memberof TypeReport
     */
    count: number;
    /**
     * 
     * @type {number}
     * @memberof TypeReport
     */
    low: number;
    /**
     * 
     * @type {number}
     * @memberof TypeReport
     */
    high: number;
    /**
     * 
     * @type {number}
     * @memberof TypeReport
     */
    deviation: number;
    /**
     * 
     * @type {string}
     * @memberof TypeReport
     */
    status: string;
    /**
     * 
     * @type {number}
     * @memberof TypeReport
     */
    default_low?: number;
    /**
     * 
     * @type {number}
     * @memberof TypeReport
     */
    default_high?: number;
    /**
     * 
     * @type {number}
     * @memberof TypeReport
     */
    flexible?: number;
    /**
     * 
     * @type {Array<CountedCard>}
     * @memberof TypeReport
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
     * @type {Array<LocationInner>}
     * @memberof ValidationError
     */
    loc: Array<LocationInner>;
    /**
     * 
     * @type {string}
     * @memberof ValidationError
     */
    msg: string;
    /**
     * 
     * @type {string}
     * @memberof ValidationError
     */
    type: string;
    /**
     * 
     * @type {any}
     * @memberof ValidationError
     */
    input?: any | null;
    /**
     * 
     * @type {object}
     * @memberof ValidationError
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
     * @type {string}
     * @memberof WarmRequest
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
     * @type {string}
     * @memberof Way
     */
    kind: string;
    /**
     * 
     * @type {AnswerGrade}
     * @memberof Way
     */
    grade: AnswerGrade;
    /**
     * 
     * @type {string}
     * @memberof Way
     */
    column: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof Way
     */
    cards: Array<string>;
}


