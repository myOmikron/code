/* tslint:disable */
/* eslint-disable */

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
     * @type {Array<string>}
     * @memberof CutCandidate
     */
    reasons?: Array<string>;
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
     * @type {string}
     * @memberof DiagnosticsRequest
     */
    commander_oracle_id?: string | null;
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
     * @type {Array<string>}
     * @memberof FillRequest
     */
    rejected?: Array<string>;
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
     * @type {Array<string>}
     * @memberof FillResult
     */
    notes?: Array<string>;
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
 * 
 * @export
 * @interface LocationInner
 */
export interface LocationInner {
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
    key?: string | null;
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
     * @type {Array<string>}
     * @memberof ReplaceRequest
     */
    excluded?: Array<string>;
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
     * @type {Array<string>}
     * @memberof SuggestionReport
     */
    notes?: Array<string>;
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
     * @type {Array<string>}
     * @memberof SwapsRequest
     */
    excluded?: Array<string>;
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
