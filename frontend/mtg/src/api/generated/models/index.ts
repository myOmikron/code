/* tslint:disable */
/* eslint-disable */
/**
 * Request to file stacks into a collection
 * @export
 * @interface AddCollectionEntriesRequest
 */
export interface AddCollectionEntriesRequest {
    /**
     * The stacks to file
     * @type {Array<NewCollectionEntry>}
     * @memberof AddCollectionEntriesRequest
     */
    entries: Array<NewCollectionEntry>;
}
/**
 * A card to put into a deck
 * @export
 * @interface AddDeckCardRequest
 */
export interface AddDeckCardRequest {
    /**
     * Whether the copies are the foil ones, `null` for the ordinary ones
     * @type {boolean}
     * @memberof AddDeckCardRequest
     */
    foil?: boolean | null;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof AddDeckCardRequest
     */
    printing: string;
    /**
     * How many copies to put in
     * @type {number}
     * @memberof AddDeckCardRequest
     */
    quantity: number;
    /**
     * Which zone it goes into
     * @type {DeckZone}
     * @memberof AddDeckCardRequest
     */
    zone: DeckZone;
}


/**
 * Why a passkey could not be added
 * @export
 * @interface AddPasskeyErrors
 */
export interface AddPasskeyErrors {
    /**
     * This authenticator already holds a passkey for this account
     * @type {boolean}
     * @memberof AddPasskeyErrors
     */
    already_registered: boolean;
    /**
     * The browser's response was not a credential
     * @type {boolean}
     * @memberof AddPasskeyErrors
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `passkeys/start` was never called
     * @type {boolean}
     * @memberof AddPasskeyErrors
     */
    no_ceremony: boolean;
    /**
     * The credential did not check out
     * @type {boolean}
     * @memberof AddPasskeyErrors
     */
    registration_failed: boolean;
}
/**
 * Request to put a card on a watch list
 * @export
 * @interface AddWatchListEntryRequest
 */
export interface AddWatchListEntryRequest {
    /**
     * Alarm below this price in euro cents, `None` for no alarm
     * @type {number}
     * @memberof AddWatchListEntryRequest
     */
    alarm_price_cents?: number | null;
    /**
     * Whether only this very printing counts
     * @type {boolean}
     * @memberof AddWatchListEntryRequest
     */
    exact_printing: boolean;
    /**
     * The finish that is wanted
     * @type {CardFinish}
     * @memberof AddWatchListEntryRequest
     */
    finish: CardFinish;
    /**
     * Which languages count, as Scryfall's codes; empty for any
     * @type {Array<string>}
     * @memberof AddWatchListEntryRequest
     */
    languages?: Array<string>;
    /**
     * Whether only the named finish counts
     * @type {boolean}
     * @memberof AddWatchListEntryRequest
     */
    match_finish: boolean;
    /**
     * What the entry is for
     * @type {string}
     * @memberof AddWatchListEntryRequest
     */
    note: string;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof AddWatchListEntryRequest
     */
    printing: string;
    /**
     * How many copies the account is after, at least one
     * @type {number}
     * @memberof AddWatchListEntryRequest
     */
    wanted: number;
}


/**
 * The response that is sent in a case of an error the caller should report to an admin
 * @export
 * @interface ApiErrorResponse
 */
export interface ApiErrorResponse {
    /**
     * ID of the opentelemetry trace this error originated in
     * @type {string}
     * @memberof ApiErrorResponse
     */
    trace_id: string;
}
/**
 * What a Commander bracket asks of a deck
 * @export
 * @interface BracketRulesResponse
 */
export interface BracketRulesResponse {
    /**
     * Whether chained extra turns are expected to stay out
     * @type {boolean}
     * @memberof BracketRulesResponse
     */
    extra_turns: boolean;
    /**
     * Whether mass land denial is expected to stay out
     * @type {boolean}
     * @memberof BracketRulesResponse
     */
    mass_land_denial: boolean;
    /**
     * How many Game Changers may be played, `null` for no limit
     * @type {number}
     * @memberof BracketRulesResponse
     */
    max_game_changers?: number | null;
    /**
     * Which bracket, one to five
     * @type {number}
     * @memberof BracketRulesResponse
     */
    number: number;
    /**
     * The slug the client turns into a name
     * @type {string}
     * @memberof BracketRulesResponse
     */
    slug: string;
    /**
     * Whether two card infinite combos are expected to stay out
     * @type {boolean}
     * @memberof BracketRulesResponse
     */
    two_card_combos: boolean;
}

/**
 * Condition of a physical card, using Cardmarket's grades
 * 
 * The order of the variants is the grading scale, best first. Keep it that way — comparisons and sorting read better than a separate rank function.
 * @export
 */
export const CardCondition = {
    /**
    * Mint
    */
    Mint: 'Mint',
    /**
    * Near Mint
    */
    NearMint: 'NearMint',
    /**
    * Excellent
    */
    Excellent: 'Excellent',
    /**
    * Good
    */
    Good: 'Good',
    /**
    * Light Played
    */
    LightPlayed: 'LightPlayed',
    /**
    * Played
    */
    Played: 'Played',
    /**
    * Poor
    */
    Poor: 'Poor'
} as const;
export type CardCondition = typeof CardCondition[keyof typeof CardCondition];


/**
 * Finish of a physical card, mirroring Scryfall's `finishes`
 * 
 * These three are the complete set — Scryfall documents `finishes` as exactly `nonfoil`, `foil` and `etched`, and prices it accordingly (`eur`/`eur_foil`, `usd`/`usd_foil`/`usd_etched`).
 * 
 * Special treatments such as surge, textured, galaxy or neon ink are **not** finishes: they live in Scryfall's `promo_types`/`frame_effects` and get their own collector number, hence their own printing id. Adding them here would encode the same fact twice and allow combinations that cannot exist. A finish only ever describes what varies *within* one printing.
 * @export
 */
export const CardFinish = {
    /**
    * Regular, non-foil
    */
    Nonfoil: 'Nonfoil',
    /**
    * Traditional foil
    */
    Foil: 'Foil',
    /**
    * Etched foil
    */
    Etched: 'Etched'
} as const;
export type CardFinish = typeof CardFinish[keyof typeof CardFinish];


/**
 * Rarity of a printing, as Scryfall reports it
 * 
 * The order of the variants is the ladder, commonest first — the same order the set symbol's colours run in. Keep it that way: sorting a collection by rarity means sorting by this, and a separate rank function would be a second place to get it wrong.
 * 
 * [`Self::Special`] and [`Self::Bonus`] sit at the end because they are not a step on that ladder — they mark the timeshifted and bonus sheets, which have no place among the four.
 * @export
 */
export const CardRarity = {
    /**
    * Common
    */
    Common: 'Common',
    /**
    * Uncommon
    */
    Uncommon: 'Uncommon',
    /**
    * Rare
    */
    Rare: 'Rare',
    /**
    * Mythic rare
    */
    Mythic: 'Mythic',
    /**
    * Timeshifted and the like
    */
    Special: 'Special',
    /**
    * Bonus sheets
    */
    Bonus: 'Bonus'
} as const;
export type CardRarity = typeof CardRarity[keyof typeof CardRarity];

/**
 * One stack of identical cards in a collection
 * @export
 * @interface CollectionEntryResponse
 */
export interface CollectionEntryResponse {
    /**
     * The day the cards were acquired
     * @type {string}
     * @memberof CollectionEntryResponse
     */
    acquired_at?: string | null;
    /**
     * Condition of the cards
     * @type {CardCondition}
     * @memberof CollectionEntryResponse
     */
    condition: CardCondition;
    /**
     * When the stack was filed
     * @type {string}
     * @memberof CollectionEntryResponse
     */
    created_at: string;
    /**
     * Finish of the cards
     * @type {CardFinish}
     * @memberof CollectionEntryResponse
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing — the client resolves name and image from it
     * @type {string}
     * @memberof CollectionEntryResponse
     */
    printing: string;
    /**
     * What was paid per copy, in euro cents
     * @type {number}
     * @memberof CollectionEntryResponse
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies this stack holds
     * @type {number}
     * @memberof CollectionEntryResponse
     */
    quantity: number;
    /**
     * Whether the cards carry an artist's signature
     * @type {boolean}
     * @memberof CollectionEntryResponse
     */
    signed: boolean;
    /**
     * Primary key
     * @type {string}
     * @memberof CollectionEntryResponse
     */
    uuid: string;
}


/**
 * A collection with what is inside it, for the overview
 * @export
 * @interface CollectionOverviewResponse
 */
export interface CollectionOverviewResponse {
    /**
     * Artwork of the most valuable cards in it, at most two
     * @type {Array<string>}
     * @memberof CollectionOverviewResponse
     */
    arts: Array<string>;
    /**
     * How many copies are filed in it
     * @type {number}
     * @memberof CollectionOverviewResponse
     */
    cards: number;
    /**
     * The collection itself
     * @type {CollectionResponse}
     * @memberof CollectionOverviewResponse
     */
    collection: CollectionResponse;
    /**
     * The colours the collection holds, as the letters `WUBRG`
     * @type {string}
     * @memberof CollectionOverviewResponse
     */
    colors: string;
    /**
     * What those copies are worth in euro cents
     * @type {number}
     * @memberof CollectionOverviewResponse
     */
    price_eur_cents: number;
    /**
     * Copies per rarity
     * @type {RarityCountsResponse}
     * @memberof CollectionOverviewResponse
     */
    rarities: RarityCountsResponse;
}
/**
 * 
 * @export
 * @interface CollectionResponse
 */
export interface CollectionResponse {
    /**
     * The colour the collection is drawn in
     * @type {string}
     * @memberof CollectionResponse
     */
    color: string;
    /**
     * 
     * @type {string}
     * @memberof CollectionResponse
     */
    created_at: string;
    /**
     * The deck this collection stands for, `None` for a collection on a shelf
     * @type {string}
     * @memberof CollectionResponse
     */
    deck?: string | null;
    /**
     * 
     * @type {string}
     * @memberof CollectionResponse
     */
    description: string;
    /**
     * The pictogram drawn on the collection
     * @type {string}
     * @memberof CollectionResponse
     */
    icon: string;
    /**
     * 
     * @type {string}
     * @memberof CollectionResponse
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof CollectionResponse
     */
    share_token?: string | null;
    /**
     * Wrapper for the primary key of the [`Collection`] model. To have better distinguishable types.
     * @type {string}
     * @memberof CollectionResponse
     */
    uuid: string;
    /**
     * 
     * @type {Visibility}
     * @memberof CollectionResponse
     */
    visibility: Visibility;
}


/**
 * Everything the statistics tab shows, counted server-side
 * 
 * All money is euro cents. Every count is copies, not stacks — a playset of four counts four times.
 * @export
 * @interface CollectionStatisticsResponse
 */
export interface CollectionStatisticsResponse {
    /**
     * The most represented illustrators
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    artists: Array<StatBucketResponse>;
    /**
     * Mean value of a priced copy, in euro cents
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    average_value_cents: number;
    /**
     * Copies whose colour identity contains each colour, keyed `W U B R G`
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    color_identity: Array<StatBucketResponse>;
    /**
     * Copies per colour count, keyed `0` through `5`
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    color_spread: Array<StatBucketResponse>;
    /**
     * Copies per condition, best grade first
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    conditions: Array<StatBucketResponse>;
    /**
     * How many different sets are represented
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    distinct_sets: number;
    /**
     * Copies per finish
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    finishes: Array<StatBucketResponse>;
    /**
     * Copies legal in each tracked format
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    formats: Array<StatBucketResponse>;
    /**
     * The most common rules keywords
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    keywords: Array<StatBucketResponse>;
    /**
     * Copies per mana value, lands excluded, everything above `7` pooled there
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    mana_curve: Array<StatBucketResponse>;
    /**
     * Today's value of exactly those copies, in euro cents
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    market_of_purchased_cents: number;
    /**
     * What the whole collection fetches today, in euro cents
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    market_value_cents: number;
    /**
     * The oldest printing in the collection, `null` when nothing resolved
     * @type {OldestPrintingResponse}
     * @memberof CollectionStatisticsResponse
     */
    oldest?: OldestPrintingResponse | null;
    /**
     * Coloured mana symbols across all costs, weighted by copies, keyed `W U B R G`
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    pips: Array<StatBucketResponse>;
    /**
     * Paid against worth, for the stacks with the most money riding on them
     * @type {Array<PricePointResponse>}
     * @memberof CollectionStatisticsResponse
     */
    price_points: Array<PricePointResponse>;
    /**
     * Copies the catalog has a price for
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    priced_cards: number;
    /**
     * What was paid, over the stacks that recorded it, in euro cents
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    purchase_total_cents: number;
    /**
     * Copies with a recorded purchase price
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    purchased_cards: number;
    /**
     * Copies per rarity, most first, keyed by Scryfall's lowercase spelling
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    rarities: Array<StatBucketResponse>;
    /**
     * Copies on the reserved list
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    reserved_cards: number;
    /**
     * What those are worth, in euro cents
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    reserved_value_cents: number;
    /**
     * Sets by copies, most first
     * @type {Array<SetBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    sets: Array<SetBucketResponse>;
    /**
     * Cumulative copies and value over time
     * @type {Array<TimelinePointResponse>}
     * @memberof CollectionStatisticsResponse
     */
    timeline: Array<TimelinePointResponse>;
    /**
     * The most valuable stacks
     * @type {Array<TopCardResponse>}
     * @memberof CollectionStatisticsResponse
     */
    top_cards: Array<TopCardResponse>;
    /**
     * Copies filed in total
     * @type {number}
     * @memberof CollectionStatisticsResponse
     */
    total_cards: number;
    /**
     * Copies per card type, keyed by lowercase type slug plus `other`
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    types: Array<StatBucketResponse>;
    /**
     * Copies per price bracket, keyed `bulk low mid high premium chase`
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    value_buckets: Array<StatBucketResponse>;
    /**
     * Copies per release year of the printing, oldest first
     * @type {Array<StatBucketResponse>}
     * @memberof CollectionStatisticsResponse
     */
    years: Array<StatBucketResponse>;
}
/**
 * @type CommanderRule
 * Whether the format is played with a commander
 * @export
 */
export type CommanderRule = CommanderRuleOneOf | CommanderRuleOneOf1;
/**
 * No commander zone
 * @export
 * @interface CommanderRuleOneOf
 */
export interface CommanderRuleOneOf {
    /**
     * 
     * @type {CommanderRuleOneOfKindEnum}
     * @memberof CommanderRuleOneOf
     */
    kind: CommanderRuleOneOfKindEnum;
}


/**
 * @export
 */
export const CommanderRuleOneOfKindEnum = {
    none: 'none'
} as const;
export type CommanderRuleOneOfKindEnum = typeof CommanderRuleOneOfKindEnum[keyof typeof CommanderRuleOneOfKindEnum];

/**
 * A commander is required
 * @export
 * @interface CommanderRuleOneOf1
 */
export interface CommanderRuleOneOf1 {
    /**
     * 
     * @type {CommanderRuleOneOf1KindEnum}
     * @memberof CommanderRuleOneOf1
     */
    kind: CommanderRuleOneOf1KindEnum;
    /**
     * Most cards in the commander zone, two for partners
     * @type {number}
     * @memberof CommanderRuleOneOf1
     */
    max: number;
    /**
     * Fewest cards in the commander zone
     * @type {number}
     * @memberof CommanderRuleOneOf1
     */
    min: number;
}


/**
 * @export
 */
export const CommanderRuleOneOf1KindEnum = {
    required: 'required'
} as const;
export type CommanderRuleOneOf1KindEnum = typeof CommanderRuleOneOf1KindEnum[keyof typeof CommanderRuleOneOf1KindEnum];

/**
 * 
 * @export
 * @interface CreateCollectionRequest
 */
export interface CreateCollectionRequest {
    /**
     * The colour the collection is drawn in
     * @type {string}
     * @memberof CreateCollectionRequest
     */
    color: string;
    /**
     * 
     * @type {string}
     * @memberof CreateCollectionRequest
     */
    description: string;
    /**
     * The pictogram drawn on the collection
     * @type {string}
     * @memberof CreateCollectionRequest
     */
    icon: string;
    /**
     * 
     * @type {string}
     * @memberof CreateCollectionRequest
     */
    name: string;
    /**
     * 
     * @type {Visibility}
     * @memberof CreateCollectionRequest
     */
    visibility: Visibility;
}


/**
 * Request to make a folder
 * @export
 * @interface CreateDeckFolderRequest
 */
export interface CreateDeckFolderRequest {
    /**
     * What it is called
     * @type {string}
     * @memberof CreateDeckFolderRequest
     */
    name: string;
}
/**
 * Request to create a deck
 * @export
 * @interface CreateDeckRequest
 */
export interface CreateDeckRequest {
    /**
     * Optional description
     * @type {string}
     * @memberof CreateDeckRequest
     */
    description?: string | null;
    /**
     * The format to build for
     * @type {string}
     * @memberof CreateDeckRequest
     */
    format: string;
    /**
     * Name of the deck
     * @type {string}
     * @memberof CreateDeckRequest
     */
    name: string;
    /**
     * Who may see the deck
     * @type {Visibility}
     * @memberof CreateDeckRequest
     */
    visibility: Visibility;
}


/**
 * Request to create a tag on a deck
 * @export
 * @interface CreateDeckTagRequest
 */
export interface CreateDeckTagRequest {
    /**
     * The colour it is drawn in
     * @type {string}
     * @memberof CreateDeckTagRequest
     */
    color: string;
    /**
     * Whether assignments follow the card through every deck and printing
     * @type {boolean}
     * @memberof CreateDeckTagRequest
     */
    global: boolean;
    /**
     * The icon drawn inside its colour marker
     * @type {string}
     * @memberof CreateDeckTagRequest
     */
    icon: string;
    /**
     * What the tag is called
     * @type {string}
     * @memberof CreateDeckTagRequest
     */
    name: string;
}
/**
 * Request to create a tag that follows a card everywhere
 * @export
 * @interface CreateGlobalTagRequest
 */
export interface CreateGlobalTagRequest {
    /**
     * The colour it is drawn in
     * @type {string}
     * @memberof CreateGlobalTagRequest
     */
    color: string;
    /**
     * The icon drawn inside its colour marker
     * @type {string}
     * @memberof CreateGlobalTagRequest
     */
    icon: string;
    /**
     * What the tag is called
     * @type {string}
     * @memberof CreateGlobalTagRequest
     */
    name: string;
}
/**
 * Request to create a watch list
 * @export
 * @interface CreateWatchListRequest
 */
export interface CreateWatchListRequest {
    /**
     * The colour it is drawn in
     * @type {string}
     * @memberof CreateWatchListRequest
     */
    color: string;
    /**
     * Description shown above the entries
     * @type {string}
     * @memberof CreateWatchListRequest
     */
    description: string;
    /**
     * The pictogram drawn on it
     * @type {string}
     * @memberof CreateWatchListRequest
     */
    icon: string;
    /**
     * What the list is called
     * @type {string}
     * @memberof CreateWatchListRequest
     */
    name: string;
}
/**
 * What the catalog knows about a deck card's printing
 * @export
 * @interface DeckCardCatalogResponse
 */
export interface DeckCardCatalogResponse {
    /**
     * Cardmarket's id of the product this printing is sold as
     * @type {number}
     * @memberof DeckCardCatalogResponse
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    collector_number: string;
    /**
     * Colour identity as the letters `WUBRG`
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    color_identity: string;
    /**
     * Whether the card takes extra turns, which brackets 1 and 2 play none of
     * 
     * Derived like [`Self::mass_land_denial`], with the same caveat.
     * @type {boolean}
     * @memberof DeckCardCatalogResponse
     */
    extra_turns: boolean;
    /**
     * The finishes this printing exists in, as Scryfall spells them
     * @type {Array<string>}
     * @memberof DeckCardCatalogResponse
     */
    finishes: Array<string>;
    /**
     * Whether Wizards lists the card as a Game Changer
     * 
     * The curated list behind the Commander brackets, refreshed with the catalog. A deck's bracket is checked against how many of these it plays.
     * @type {boolean}
     * @memberof DeckCardCatalogResponse
     */
    game_changer: boolean;
    /**
     * The back face's artwork for a closer look
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    image_back_normal?: string | null;
    /**
     * The back face's artwork for a list row
     * 
     * `None` unless the card is photographed twice: a transform card, a modal double-faced card, a battle. A split card or an adventure prints both halves on one side, so there is nothing to turn over.
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    image_back_small?: string | null;
    /**
     * Artwork for a closer look
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    image_normal?: string | null;
    /**
     * Artwork for a list row
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    image_small?: string | null;
    /**
     * Language of the printing, as Scryfall's code
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    lang: string;
    /**
     * The formats this printing is legal in, of the ones the catalog tracks
     * 
     * Only a "legal" set: a format missing here may be banned, restricted or simply not offered, which the client tells apart via Scryfall when it needs the reason.
     * @type {Array<string>}
     * @memberof DeckCardCatalogResponse
     */
    legal_formats: Array<string>;
    /**
     * Mana cost as printed, faces joined by ` // `
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    mana_cost: string;
    /**
     * Mana value
     * @type {number}
     * @memberof DeckCardCatalogResponse
     */
    mana_value: number;
    /**
     * Whether the card denies lands en masse
     * 
     * Derived from the rules text when the catalog is synced, not stored as the text itself. Brackets 1 to 3 play none of these, so the legality band checks a claimed bracket against it. Detection errs toward silence: a card the patterns miss raises no warning, which is the right way for a warning to fail.
     * @type {boolean}
     * @memberof DeckCardCatalogResponse
     */
    mass_land_denial: boolean;
    /**
     * The printed name
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    name: string;
    /**
     * Groups every printing of the same card, which is what a copy limit counts
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    oracle_id?: string | null;
    /**
     * Market price in euro cents
     * @type {number}
     * @memberof DeckCardCatalogResponse
     */
    price_eur_cents?: number | null;
    /**
     * Foil market price in euro cents
     * @type {number}
     * @memberof DeckCardCatalogResponse
     */
    price_eur_foil_cents?: number | null;
    /**
     * The colours the card can produce, as the letters `WUBRGC`
     * 
     * What a mana base is counted with: sources of each colour against the pips the deck asks for.
     * @type {Array<string>}
     * @memberof DeckCardCatalogResponse
     */
    produced_mana: Array<string>;
    /**
     * How rare the printing is
     * @type {CardRarity}
     * @memberof DeckCardCatalogResponse
     */
    rarity: CardRarity;
    /**
     * Whether the card is on the reserved list
     * @type {boolean}
     * @memberof DeckCardCatalogResponse
     */
    reserved: boolean;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    set_code: string;
    /**
     * Full set name
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    set_name: string;
    /**
     * Type line as printed
     * @type {string}
     * @memberof DeckCardCatalogResponse
     */
    type_line: string;
}


/**
 * One slot of a deck, with the card it holds
 * @export
 * @interface DeckCardResponse
 */
export interface DeckCardResponse {
    /**
     * The card, as far as the catalog knows it
     * @type {DeckCardCatalogResponse}
     * @memberof DeckCardResponse
     */
    card?: DeckCardCatalogResponse | null;
    /**
     * Whether the copies in this slot are the foil ones
     * @type {boolean}
     * @memberof DeckCardResponse
     */
    foil: boolean;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof DeckCardResponse
     */
    printing: string;
    /**
     * How many copies this slot holds
     * @type {number}
     * @memberof DeckCardResponse
     */
    quantity: number;
    /**
     * The tags put on this slot
     * @type {Array<string>}
     * @memberof DeckCardResponse
     */
    tags: Array<string>;
    /**
     * Primary key
     * @type {string}
     * @memberof DeckCardResponse
     */
    uuid: string;
    /**
     * Which zone the slot sits in
     * @type {DeckZone}
     * @memberof DeckCardResponse
     */
    zone: DeckZone;
}


/**
 * One commander at the head of a deck
 * @export
 * @interface DeckCommanderResponse
 */
export interface DeckCommanderResponse {
    /**
     * Colour identity as the letters `WUBRG`
     * @type {string}
     * @memberof DeckCommanderResponse
     */
    color_identity: string;
    /**
     * Artwork for a wider tile
     * @type {string}
     * @memberof DeckCommanderResponse
     */
    image_normal?: string | null;
    /**
     * Artwork for a tile
     * @type {string}
     * @memberof DeckCommanderResponse
     */
    image_small?: string | null;
    /**
     * The printed name
     * @type {string}
     * @memberof DeckCommanderResponse
     */
    name: string;
}
/**
 * Where the deck list and the cardboard filed under it disagree
 * 
 * Every list empty means the deck in the box is the deck on the list, which is what lets the header say so without asking a second question.
 * @export
 * @interface DeckDriftResponse
 */
export interface DeckDriftResponse {
    /**
     * Whether the deck keeps a collection at all; nothing drifts while it does not
     * @type {boolean}
     * @memberof DeckDriftResponse
     */
    keeps_collection: boolean;
    /**
     * Copies lying in the deck whose card the list does not name at all
     * @type {Array<DeckDriftRowResponse>}
     * @memberof DeckDriftResponse
     */
    not_in_deck: Array<DeckDriftRowResponse>;
    /**
     * Copies lying in the deck in a printing or finish the list does not ask for
     * @type {Array<DeckDriftRowResponse>}
     * @memberof DeckDriftResponse
     */
    other_printing: Array<DeckDriftRowResponse>;
    /**
     * Copies the list asks for that are nowhere in the deck
     * @type {Array<DeckDriftRowResponse>}
     * @memberof DeckDriftResponse
     */
    pending: Array<DeckDriftRowResponse>;
    /**
     * Copies of a card the list wants, beyond the count it asks for
     * @type {Array<DeckDriftRowResponse>}
     * @memberof DeckDriftResponse
     */
    surplus: Array<DeckDriftRowResponse>;
}
/**
 * One card the deck list and the deck's own collection disagree about
 * @export
 * @interface DeckDriftRowResponse
 */
export interface DeckDriftRowResponse {
    /**
     * What the catalog knows about the printing
     * @type {SourcedPrintingResponse}
     * @memberof DeckDriftRowResponse
     */
    card?: SourcedPrintingResponse | null;
    /**
     * Whether those copies are the foil ones
     * @type {boolean}
     * @memberof DeckDriftRowResponse
     */
    foil: boolean;
    /**
     * Scryfall's id of the printing the row is about
     * @type {string}
     * @memberof DeckDriftRowResponse
     */
    printing: string;
    /**
     * How many copies the disagreement is about
     * @type {number}
     * @memberof DeckDriftRowResponse
     */
    quantity: number;
    /**
     * The printing the list asks for instead, only on `other_printing` rows
     * @type {SourcedPrintingResponse}
     * @memberof DeckDriftRowResponse
     */
    wanted?: SourcedPrintingResponse | null;
}

/**
 * Which of an account's folders a folder is
 * @export
 */
export const DeckFolderKind = {
    /**
    * A folder the account made and named
    */
    Custom: 'Custom',
    /**
    * The one folder the app knows: decks that were put away
    */
    Archive: 'Archive'
} as const;
export type DeckFolderKind = typeof DeckFolderKind[keyof typeof DeckFolderKind];

/**
 * A shelf an account files its decks on
 * @export
 * @interface DeckFolderResponse
 */
export interface DeckFolderResponse {
    /**
     * When the folder was made
     * @type {string}
     * @memberof DeckFolderResponse
     */
    created_at: string;
    /**
     * Which of the folders this is
     * @type {DeckFolderKind}
     * @memberof DeckFolderResponse
     */
    kind: DeckFolderKind;
    /**
     * What the folder is called
     * 
     * The archive carries the name it was made under; a client shows it under its own word for the archive instead, in the language it is running in.
     * @type {string}
     * @memberof DeckFolderResponse
     */
    name: string;
    /**
     * Primary key
     * @type {string}
     * @memberof DeckFolderResponse
     */
    uuid: string;
}


/**
 * A deck as the list of decks shows it
 * @export
 * @interface DeckOverviewResponse
 */
export interface DeckOverviewResponse {
    /**
     * How many cards sit in the deck proper, the sideboard aside
     * @type {number}
     * @memberof DeckOverviewResponse
     */
    cards: number;
    /**
     * The commanders, in the order they were put in
     * @type {Array<DeckCommanderResponse>}
     * @memberof DeckOverviewResponse
     */
    commanders: Array<DeckCommanderResponse>;
    /**
     * The deck itself
     * @type {DeckResponse}
     * @memberof DeckOverviewResponse
     */
    deck: DeckResponse;
    /**
     * What those cards are worth in euro cents
     * @type {number}
     * @memberof DeckOverviewResponse
     */
    price_eur_cents: number;
}
/**
 * A deck as its owner sees it
 * @export
 * @interface DeckResponse
 */
export interface DeckResponse {
    /**
     * Whether the table agreed to cards the format bans
     * @type {boolean}
     * @memberof DeckResponse
     */
    allow_banned: boolean;
    /**
     * Whether the table agreed to more copies of a card than the format allows
     * @type {boolean}
     * @memberof DeckResponse
     */
    allow_duplicates: boolean;
    /**
     * Whether the table agreed to more commanders than the format allows
     * @type {boolean}
     * @memberof DeckResponse
     */
    allow_extra_commanders: boolean;
    /**
     * The colours the deck may play, `null` for whatever the commander allows
     * @type {string}
     * @memberof DeckResponse
     */
    allowed_color_identity?: string | null;
    /**
     * Which Commander bracket the deck is built to, `null` when unset
     * @type {number}
     * @memberof DeckResponse
     */
    bracket?: number | null;
    /**
     * When the deck was created
     * @type {string}
     * @memberof DeckResponse
     */
    created_at: string;
    /**
     * How many cards the deck is built to, `null` for the format's rule
     * 
     * The commanders count toward it, the way the format's own size does.
     * @type {number}
     * @memberof DeckResponse
     */
    deck_size?: number | null;
    /**
     * Optional description, e.g. the deck's game plan
     * @type {string}
     * @memberof DeckResponse
     */
    description?: string | null;
    /**
     * The folder the deck is filed in, `null` while it is on no shelf
     * @type {string}
     * @memberof DeckResponse
     */
    folder?: string | null;
    /**
     * The format the deck is built for
     * @type {string}
     * @memberof DeckResponse
     */
    format: string;
    /**
     * Name of the deck
     * @type {string}
     * @memberof DeckResponse
     */
    name: string;
    /**
     * Secret of the share link, `null` once the link is revoked
     * @type {string}
     * @memberof DeckResponse
     */
    share_token?: string | null;
    /**
     * Primary key
     * @type {string}
     * @memberof DeckResponse
     */
    uuid: string;
    /**
     * Who may see the deck
     * @type {Visibility}
     * @memberof DeckResponse
     */
    visibility: Visibility;
}


/**
 * @type DeckSize
 * How many cards a deck holds
 * @export
 */
export type DeckSize = DeckSizeOneOf | DeckSizeOneOf1;
/**
 * Exactly this many, commander included
 * @export
 * @interface DeckSizeOneOf
 */
export interface DeckSizeOneOf {
    /**
     * The count
     * @type {number}
     * @memberof DeckSizeOneOf
     */
    cards: number;
    /**
     * 
     * @type {DeckSizeOneOfKindEnum}
     * @memberof DeckSizeOneOf
     */
    kind: DeckSizeOneOfKindEnum;
}


/**
 * @export
 */
export const DeckSizeOneOfKindEnum = {
    exactly: 'exactly'
} as const;
export type DeckSizeOneOfKindEnum = typeof DeckSizeOneOfKindEnum[keyof typeof DeckSizeOneOfKindEnum];

/**
 * At least this many, no upper bound
 * @export
 * @interface DeckSizeOneOf1
 */
export interface DeckSizeOneOf1 {
    /**
     * The count
     * @type {number}
     * @memberof DeckSizeOneOf1
     */
    cards: number;
    /**
     * 
     * @type {DeckSizeOneOf1KindEnum}
     * @memberof DeckSizeOneOf1
     */
    kind: DeckSizeOneOf1KindEnum;
}


/**
 * @export
 */
export const DeckSizeOneOf1KindEnum = {
    at_least: 'at_least'
} as const;
export type DeckSizeOneOf1KindEnum = typeof DeckSizeOneOf1KindEnum[keyof typeof DeckSizeOneOf1KindEnum];

/**
 * Everything the sourcing view is drawn from
 * @export
 * @interface DeckSourcingResponse
 */
export interface DeckSourcingResponse {
    /**
     * What could still be taken from elsewhere
     * @type {Array<SourcingCandidateResponse>}
     * @memberof DeckSourcingResponse
     */
    candidates: Array<SourcingCandidateResponse>;
    /**
     * The deck's own collection, `None` while it keeps none
     * @type {CollectionResponse}
     * @memberof DeckSourcingResponse
     */
    collection?: CollectionResponse | null;
    /**
     * What is filed in the deck's own collection
     * @type {Array<SourcedStackResponse>}
     * @memberof DeckSourcingResponse
     */
    filed: Array<SourcedStackResponse>;
    /**
     * What the list asks for
     * @type {Array<SourcingSlotResponse>}
     * @memberof DeckSourcingResponse
     */
    slots: Array<SourcingSlotResponse>;
}
/**
 * An etiquette put on a deck's cards
 * @export
 * @interface DeckTagResponse
 */
export interface DeckTagResponse {
    /**
     * The colour it is drawn in
     * @type {string}
     * @memberof DeckTagResponse
     */
    color: string;
    /**
     * The deck it is local to, `null` for one offered on every deck
     * @type {string}
     * @memberof DeckTagResponse
     */
    deck?: string | null;
    /**
     * The icon drawn inside its colour marker
     * @type {string}
     * @memberof DeckTagResponse
     */
    icon: string;
    /**
     * What the tag is called
     * @type {string}
     * @memberof DeckTagResponse
     */
    name: string;
    /**
     * Primary key
     * @type {string}
     * @memberof DeckTagResponse
     */
    uuid: string;
}

/**
 * The zone a [`DeckCard`] sits in
 * @export
 */
export const DeckZone = {
    /**
    * The main deck
    */
    Main: 'Main',
    /**
    * The sideboard
    */
    Side: 'Side',
    /**
    * The command zone — one card, or two for Partner decks
    */
    Commander: 'Commander',
    /**
    * The companion slot
    */
    Companion: 'Companion',
    /**
    * Considered but not currently in the deck
    */
    Maybe: 'Maybe'
} as const;
export type DeckZone = typeof DeckZone[keyof typeof DeckZone];

/**
 * Why a passkey could not be deleted
 * @export
 * @interface DeletePasskeyErrors
 */
export interface DeletePasskeyErrors {
    /**
     * It is the account's only passkey — deleting it would lock the account out for good
     * @type {boolean}
     * @memberof DeletePasskeyErrors
     */
    last_passkey: boolean;
    /**
     * No passkey with that id belongs to this account
     * @type {boolean}
     * @memberof DeletePasskeyErrors
     */
    unknown_passkey: boolean;
}

/**
 * What a collection can be ordered by
 * @export
 */
export const EntrySort = {
    /**
    * The order the stacks were filed in
    */
    filed: 'filed',
    /**
    * Card name
    */
    name: 'name',
    /**
    * Set, then collector number — the order a binder is in
    */
    set: 'set',
    /**
    * Rarity, commonest first
    */
    rarity: 'rarity',
    /**
    * Mana value
    */
    mana_value: 'mana_value',
    /**
    * What one copy is worth
    */
    unit_price: 'unit_price',
    /**
    * What the whole stack is worth
    */
    stack_value: 'stack_value',
    /**
    * How many copies the stack holds
    */
    quantity: 'quantity',
    /**
    * Condition, best first
    */
    condition: 'condition'
} as const;
export type EntrySort = typeof EntrySort[keyof typeof EntrySort];


/**
 * Constant string `"Err"` which is documented by schemars
 * @export
 */
export const ErrorConstant = {
    Err: 'Err'
} as const;
export type ErrorConstant = typeof ErrorConstant[keyof typeof ErrorConstant];

/**
 * Request to declare that the deck holds what its list asks for
 * @export
 * @interface FillDeckCollectionRequest
 */
export interface FillDeckCollectionRequest {
    /**
     * The one slot to fill, `None` for every slot of the deck
     * @type {string}
     * @memberof FillDeckCollectionRequest
     */
    slot?: string | null;
}
/**
 * What filling a deck's collection from its own list came to
 * @export
 * @interface FillDeckCollectionResponse
 */
export interface FillDeckCollectionResponse {
    /**
     * How many copies were filed as being in the deck
     * @type {number}
     * @memberof FillDeckCollectionResponse
     */
    filed: number;
}
/**
 * Request to finish adding a passkey
 * @export
 * @interface FinishAddPasskeyRequest
 */
export interface FinishAddPasskeyRequest {
    /**
     * The browser's `RegisterPublicKeyCredential` response
     * @type {any}
     * @memberof FinishAddPasskeyRequest
     */
    credential: any | null;
    /**
     * What to call the device, or `None` to number it
     * @type {string}
     * @memberof FinishAddPasskeyRequest
     */
    label?: string | null;
}
/**
 * Why a login could not be completed
 * @export
 * @interface FinishLoginErrors
 */
export interface FinishLoginErrors {
    /**
     * The signature did not check out
     * @type {boolean}
     * @memberof FinishLoginErrors
     */
    authentication_failed: boolean;
    /**
     * The browser's response was not a credential
     * @type {boolean}
     * @memberof FinishLoginErrors
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `login/start` was never called
     * @type {boolean}
     * @memberof FinishLoginErrors
     */
    no_ceremony: boolean;
}
/**
 * Request to finish a login ceremony
 * @export
 * @interface FinishLoginRequest
 */
export interface FinishLoginRequest {
    /**
     * The browser's `PublicKeyCredential` response
     * @type {any}
     * @memberof FinishLoginRequest
     */
    credential: any | null;
    /**
     * Keep the session alive across browser restarts
     * 
     * Off means the cookie is dropped when the browser closes — the sensible default on a machine somebody else also uses.
     * @type {boolean}
     * @memberof FinishLoginRequest
     */
    remember_me: boolean;
}
/**
 * Request to finish a registration ceremony
 * @export
 * @interface FinishRegistrationRequest
 */
export interface FinishRegistrationRequest {
    /**
     * The browser's `RegisterPublicKeyCredential` response
     * @type {any}
     * @memberof FinishRegistrationRequest
     */
    credential: any | null;
    /**
     * The token from the registration link
     * @type {string}
     * @memberof FinishRegistrationRequest
     */
    token: string;
}
/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForAddPasskeyErrors
 */
export interface FormErrorResponseForAddPasskeyErrors {
    /**
     * The actual error struct
     * @type {AddPasskeyErrors}
     * @memberof FormErrorResponseForAddPasskeyErrors
     */
    error: AddPasskeyErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForAddPasskeyErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForDeletePasskeyErrors
 */
export interface FormErrorResponseForDeletePasskeyErrors {
    /**
     * The actual error struct
     * @type {DeletePasskeyErrors}
     * @memberof FormErrorResponseForDeletePasskeyErrors
     */
    error: DeletePasskeyErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForDeletePasskeyErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForFinishLoginErrors
 */
export interface FormErrorResponseForFinishLoginErrors {
    /**
     * The actual error struct
     * @type {FinishLoginErrors}
     * @memberof FormErrorResponseForFinishLoginErrors
     */
    error: FinishLoginErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForFinishLoginErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForRegistrationErrors
 */
export interface FormErrorResponseForRegistrationErrors {
    /**
     * The actual error struct
     * @type {RegistrationErrors}
     * @memberof FormErrorResponseForRegistrationErrors
     */
    error: RegistrationErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForRegistrationErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForSignupErrors
 */
export interface FormErrorResponseForSignupErrors {
    /**
     * The actual error struct
     * @type {SignupErrors}
     * @memberof FormErrorResponseForSignupErrors
     */
    error: SignupErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForSignupErrors
     */
    result: ErrorConstant;
}


/**
 * The response that is sent in a case of an error the caller should present his user
 * @export
 * @interface FormErrorResponseForStartLoginErrors
 */
export interface FormErrorResponseForStartLoginErrors {
    /**
     * The actual error struct
     * @type {StartLoginErrors}
     * @memberof FormErrorResponseForStartLoginErrors
     */
    error: StartLoginErrors;
    /**
     * A constant `"Err"` used to differentiate this schema from any other "Ok" schema
     * @type {ErrorConstant}
     * @memberof FormErrorResponseForStartLoginErrors
     */
    result: ErrorConstant;
}


/**
 * What a format asks of a deck built for it
 * @export
 * @interface FormatRulesResponse
 */
export interface FormatRulesResponse {
    /**
     * Whether the deck's colours follow its commander unless overruled
     * @type {boolean}
     * @memberof FormatRulesResponse
     */
    color_identity_locked: boolean;
    /**
     * Whether a commander is required, and how many
     * @type {CommanderRule}
     * @memberof FormatRulesResponse
     */
    commander: CommanderRule;
    /**
     * How many cards the deck holds
     * @type {DeckSize}
     * @memberof FormatRulesResponse
     */
    deck_size: DeckSize;
    /**
     * Whether a deck in this format claims one of the brackets
     * @type {boolean}
     * @memberof FormatRulesResponse
     */
    has_brackets: boolean;
    /**
     * How many copies of one card may be played, ignoring basic lands
     * @type {number}
     * @memberof FormatRulesResponse
     */
    max_copies: number;
    /**
     * How many cards the sideboard may hold, zero when the format has none
     * @type {number}
     * @memberof FormatRulesResponse
     */
    sideboard: number;
    /**
     * The slug, matching Scryfall's `legalities` keys
     * @type {string}
     * @memberof FormatRulesResponse
     */
    slug: string;
}
/**
 * A decklist to write into a deck
 * @export
 * @interface ImportDeckCardsRequest
 */
export interface ImportDeckCardsRequest {
    /**
     * The cards to put in
     * @type {Array<AddDeckCardRequest>}
     * @memberof ImportDeckCardsRequest
     */
    cards: Array<AddDeckCardRequest>;
    /**
     * Whether to throw away what is in the deck first
     * 
     * Replacing gives every slot a new id, so anything hanging off those ids is lost. That is right for "this decklist is the deck now" and wrong for everything else, which is why it is the caller's decision.
     * @type {boolean}
     * @memberof ImportDeckCardsRequest
     */
    replace: boolean;
}
/**
 * What an import wrote
 * @export
 * @interface ImportDeckCardsResponse
 */
export interface ImportDeckCardsResponse {
    /**
     * How many slots were added
     * @type {number}
     * @memberof ImportDeckCardsResponse
     */
    added: number;
}
/**
 * One page of a collection
 * @export
 * @interface ListCardsResponse
 */
export interface ListCardsResponse {
    /**
     * The stacks on this page
     * @type {Array<ListedEntryResponse>}
     * @memberof ListCardsResponse
     */
    entries: Array<ListedEntryResponse>;
    /**
     * The page size actually applied, which may be below what was asked for
     * @type {number}
     * @memberof ListCardsResponse
     */
    limit: number;
    /**
     * Pass back as `after` to get the next page, `None` at the end
     * @type {string}
     * @memberof ListCardsResponse
     */
    next_cursor?: string | null;
    /**
     * How many stacks were skipped
     * @type {number}
     * @memberof ListCardsResponse
     */
    offset: number;
    /**
     * How many stacks match the filters in total, for the pager
     * @type {number}
     * @memberof ListCardsResponse
     */
    total: number;
    /**
     * How many copies those stacks hold — the cards, not the rows
     * @type {number}
     * @memberof ListCardsResponse
     */
    total_copies: number;
}
/**
 * The stacks in a collection
 * @export
 * @interface ListCollectionEntriesResponse
 */
export interface ListCollectionEntriesResponse {
    /**
     * One entry per stack
     * @type {Array<CollectionEntryResponse>}
     * @memberof ListCollectionEntriesResponse
     */
    entries: Array<CollectionEntryResponse>;
}
/**
 * Everything a deck's card list draws
 * @export
 * @interface ListDeckCardsResponse
 */
export interface ListDeckCardsResponse {
    /**
     * The slots, in the order they were added
     * @type {Array<DeckCardResponse>}
     * @memberof ListDeckCardsResponse
     */
    cards: Array<DeckCardResponse>;
    /**
     * The tags that can be put on them
     * @type {Array<DeckTagResponse>}
     * @memberof ListDeckCardsResponse
     */
    tags: Array<DeckTagResponse>;
}
/**
 * Every folder an account keeps
 * @export
 * @interface ListDeckFoldersResponse
 */
export interface ListDeckFoldersResponse {
    /**
     * The folders, the account's own first and the archive last
     * @type {Array<DeckFolderResponse>}
     * @memberof ListDeckFoldersResponse
     */
    folders: Array<DeckFolderResponse>;
}
/**
 * The formats a deck can be built for, and the Commander brackets
 * @export
 * @interface ListFormatsResponse
 */
export interface ListFormatsResponse {
    /**
     * The five Commander brackets, in order
     * @type {Array<BracketRulesResponse>}
     * @memberof ListFormatsResponse
     */
    brackets: Array<BracketRulesResponse>;
    /**
     * One entry per format
     * @type {Array<FormatRulesResponse>}
     * @memberof ListFormatsResponse
     */
    formats: Array<FormatRulesResponse>;
}
/**
 * The card-wide tags an account keeps
 * @export
 * @interface ListGlobalTagsResponse
 */
export interface ListGlobalTagsResponse {
    /**
     * The tags, by name
     * @type {Array<DeckTagResponse>}
     * @memberof ListGlobalTagsResponse
     */
    tags: Array<DeckTagResponse>;
}
/**
 * What a collection has lent out to decks
 * @export
 * @interface ListOnLoanResponse
 */
export interface ListOnLoanResponse {
    /**
     * One entry per stack, grouped by deck
     * @type {Array<OnLoanResponse>}
     * @memberof ListOnLoanResponse
     */
    loans: Array<OnLoanResponse>;
}
/**
 * The passkeys of the logged-in account
 * @export
 * @interface ListPasskeysResponse
 */
export interface ListPasskeysResponse {
    /**
     * One entry per registered device
     * @type {Array<SimplePasskey>}
     * @memberof ListPasskeysResponse
     */
    passkeys: Array<SimplePasskey>;
}
/**
 * Every alarm that has gone off across an account's watch lists
 * @export
 * @interface ListWatchListAlarmsResponse
 */
export interface ListWatchListAlarmsResponse {
    /**
     * The alarms, newest first
     * @type {Array<WatchListAlarmResponse>}
     * @memberof ListWatchListAlarmsResponse
     */
    alarms: Array<WatchListAlarmResponse>;
    /**
     * How many of them the reader has not seen yet
     * @type {number}
     * @memberof ListWatchListAlarmsResponse
     */
    unread: number;
}
/**
 * Every stack one watch list entry counts
 * @export
 * @interface ListWatchListCopiesResponse
 */
export interface ListWatchListCopiesResponse {
    /**
     * The stacks, the ones on a shelf before the ones sleeved into a deck
     * @type {Array<WatchedCopyResponse>}
     * @memberof ListWatchListCopiesResponse
     */
    copies: Array<WatchedCopyResponse>;
}
/**
 * Everything one watch list page is drawn from
 * @export
 * @interface ListWatchListEntriesResponse
 */
export interface ListWatchListEntriesResponse {
    /**
     * What is on it, oldest first
     * @type {Array<WatchListEntryResponse>}
     * @memberof ListWatchListEntriesResponse
     */
    entries: Array<WatchListEntryResponse>;
    /**
     * The list itself
     * @type {WatchListResponse}
     * @memberof ListWatchListEntriesResponse
     */
    list: WatchListResponse;
    /**
     * The newest catalog sync any of these cards came out of
     * 
     * What the page dates its prices by. `None` for a list whose cards the catalog holds none of.
     * @type {string}
     * @memberof ListWatchListEntriesResponse
     */
    prices_updated_at?: string | null;
}
/**
 * Every watch list an account keeps
 * @export
 * @interface ListWatchListsResponse
 */
export interface ListWatchListsResponse {
    /**
     * The lists, oldest first
     * @type {Array<WatchListOverviewResponse>}
     * @memberof ListWatchListsResponse
     */
    lists: Array<WatchListOverviewResponse>;
}
/**
 * What the catalog knows about a listed stack's card
 * 
 * `None` on an entry means the catalog has not caught up with that printing — a card filed from a set released since the last sync. The row still lists.
 * @export
 * @interface ListedCardResponse
 */
export interface ListedCardResponse {
    /**
     * Cardmarket's id of the product this printing is sold as
     * 
     * What a link to the card's market page is built from. The country page in front of it and the filters behind it are the reader's own settings. `None` when Cardmarket does not stock the printing, which is when the client falls back to a search by name.
     * @type {number}
     * @memberof ListedCardResponse
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     * @type {string}
     * @memberof ListedCardResponse
     */
    collector_number: string;
    /**
     * Colour identity as the letters `WUBRG`
     * @type {string}
     * @memberof ListedCardResponse
     */
    color_identity: string;
    /**
     * The finishes this printing exists in, as Scryfall spells them
     * @type {Array<string>}
     * @memberof ListedCardResponse
     */
    finishes: Array<string>;
    /**
     * The back face's artwork for a closer look
     * @type {string}
     * @memberof ListedCardResponse
     */
    image_back_normal?: string | null;
    /**
     * The back face's artwork for a list row
     * 
     * `None` unless the card is photographed twice: a transform card, a modal double-faced card, a battle. A split card or an adventure prints both halves on one side, so there is nothing to turn over.
     * @type {string}
     * @memberof ListedCardResponse
     */
    image_back_small?: string | null;
    /**
     * Artwork for a closer look — what a hover preview shows
     * @type {string}
     * @memberof ListedCardResponse
     */
    image_normal?: string | null;
    /**
     * Artwork for a list row
     * @type {string}
     * @memberof ListedCardResponse
     */
    image_small?: string | null;
    /**
     * Language of the printing, as Scryfall's code
     * @type {string}
     * @memberof ListedCardResponse
     */
    lang: string;
    /**
     * Mana value
     * @type {number}
     * @memberof ListedCardResponse
     */
    mana_value: number;
    /**
     * The printed name
     * @type {string}
     * @memberof ListedCardResponse
     */
    name: string;
    /**
     * Market price in euro cents
     * @type {number}
     * @memberof ListedCardResponse
     */
    price_eur_cents?: number | null;
    /**
     * Foil market price in euro cents
     * @type {number}
     * @memberof ListedCardResponse
     */
    price_eur_foil_cents?: number | null;
    /**
     * How rare the printing is
     * @type {CardRarity}
     * @memberof ListedCardResponse
     */
    rarity: CardRarity;
    /**
     * Whether the card is on the reserved list
     * @type {boolean}
     * @memberof ListedCardResponse
     */
    reserved: boolean;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof ListedCardResponse
     */
    set_code: string;
    /**
     * Full set name
     * @type {string}
     * @memberof ListedCardResponse
     */
    set_name: string;
    /**
     * Type line as printed
     * @type {string}
     * @memberof ListedCardResponse
     */
    type_line: string;
}


/**
 * One stack, with the card it holds
 * @export
 * @interface ListedEntryResponse
 */
export interface ListedEntryResponse {
    /**
     * The day the cards were acquired
     * @type {string}
     * @memberof ListedEntryResponse
     */
    acquired_at?: string | null;
    /**
     * The card, as far as the catalog knows it
     * @type {ListedCardResponse}
     * @memberof ListedEntryResponse
     */
    card?: ListedCardResponse | null;
    /**
     * Condition of the cards
     * @type {CardCondition}
     * @memberof ListedEntryResponse
     */
    condition: CardCondition;
    /**
     * When the stack was filed
     * @type {string}
     * @memberof ListedEntryResponse
     */
    created_at: string;
    /**
     * Finish of the cards
     * @type {CardFinish}
     * @memberof ListedEntryResponse
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof ListedEntryResponse
     */
    printing: string;
    /**
     * What was paid per copy, in euro cents
     * @type {number}
     * @memberof ListedEntryResponse
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies this stack holds
     * @type {number}
     * @memberof ListedEntryResponse
     */
    quantity: number;
    /**
     * Whether the cards carry an artist's signature
     * @type {boolean}
     * @memberof ListedEntryResponse
     */
    signed: boolean;
    /**
     * The owner's card-wide tags on the card this stack holds
     * @type {Array<string>}
     * @memberof ListedEntryResponse
     */
    tags: Array<string>;
    /**
     * Primary key
     * @type {string}
     * @memberof ListedEntryResponse
     */
    uuid: string;
}



/**
 * The language an outgoing mail is written in
 * 
 * Chosen by the client from the language its UI is showing — the mail should read like the page that caused it. Not persisted anywhere: every mail is triggered by a request, and that request carries the language.
 * @export
 */
export const MailLanguage = {
    /**
    * German — the default, matching the app&#39;s primary language
    */
    De: 'De',
    /**
    * English
    */
    En: 'En'
} as const;
export type MailLanguage = typeof MailLanguage[keyof typeof MailLanguage];

/**
 * The account the current session belongs to
 * @export
 * @interface MeResponse
 */
export interface MeResponse {
    /**
     * The account's login handle and display name
     * @type {string}
     * @memberof MeResponse
     */
    username: string;
    /**
     * The account's primary key
     * @type {string}
     * @memberof MeResponse
     */
    uuid: string;
}
/**
 * Request to combine stacks of the same cards into one
 * @export
 * @interface MergeCollectionEntriesRequest
 */
export interface MergeCollectionEntriesRequest {
    /**
     * The stacks to combine — at least two, all of the same printing, condition and finish, and signed alike
     * @type {Array<string>}
     * @memberof MergeCollectionEntriesRequest
     */
    entries: Array<string>;
}
/**
 * A stack to file into a collection
 * @export
 * @interface NewCollectionEntry
 */
export interface NewCollectionEntry {
    /**
     * The day the cards were acquired
     * @type {string}
     * @memberof NewCollectionEntry
     */
    acquired_at?: string | null;
    /**
     * Condition of the cards
     * @type {CardCondition}
     * @memberof NewCollectionEntry
     */
    condition: CardCondition;
    /**
     * Finish of the cards
     * @type {CardFinish}
     * @memberof NewCollectionEntry
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof NewCollectionEntry
     */
    printing: string;
    /**
     * What was paid per copy, in euro cents
     * @type {number}
     * @memberof NewCollectionEntry
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies to file
     * @type {number}
     * @memberof NewCollectionEntry
     */
    quantity: number;
    /**
     * Whether the cards carry an artist's signature
     * @type {boolean}
     * @memberof NewCollectionEntry
     */
    signed?: boolean;
}


/**
 * The oldest printing in the collection
 * @export
 * @interface OldestPrintingResponse
 */
export interface OldestPrintingResponse {
    /**
     * The card's name
     * @type {string}
     * @memberof OldestPrintingResponse
     */
    name: string;
    /**
     * The day it was released
     * @type {string}
     * @memberof OldestPrintingResponse
     */
    released_at: string;
    /**
     * Full set name
     * @type {string}
     * @memberof OldestPrintingResponse
     */
    set_name: string;
}
/**
 * A stack out of this collection that is sleeved up in a deck right now
 * @export
 * @interface OnLoanResponse
 */
export interface OnLoanResponse {
    /**
     * Collector number as printed
     * @type {string}
     * @memberof OnLoanResponse
     */
    collector_number?: string | null;
    /**
     * The deck they are in
     * @type {string}
     * @memberof OnLoanResponse
     */
    deck: string;
    /**
     * What that deck is called
     * @type {string}
     * @memberof OnLoanResponse
     */
    deck_name: string;
    /**
     * Artwork for a list row
     * @type {string}
     * @memberof OnLoanResponse
     */
    image_small?: string | null;
    /**
     * The card's name, `None` for a printing the catalog has not caught up with
     * @type {string}
     * @memberof OnLoanResponse
     */
    name?: string | null;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof OnLoanResponse
     */
    printing: string;
    /**
     * How many copies of it are in that deck
     * @type {number}
     * @memberof OnLoanResponse
     */
    quantity: number;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof OnLoanResponse
     */
    set_code?: string | null;
    /**
     * Full set name
     * @type {string}
     * @memberof OnLoanResponse
     */
    set_name?: string | null;
}
/**
 * What one card cost on one day
 * 
 * All four are euro cents and all four may be absent: Cardmarket quotes no foil price for a card that was never printed in foil, and no price at all for a product nobody is offering that day.
 * @export
 * @interface PriceDayResponse
 */
export interface PriceDayResponse {
    /**
     * The day the guide quoted these prices for
     * @type {string}
     * @memberof PriceDayResponse
     */
    day: string;
    /**
     * The cheapest offer
     * @type {number}
     * @memberof PriceDayResponse
     */
    low_cents?: number | null;
    /**
     * The cheapest foil offer
     * @type {number}
     * @memberof PriceDayResponse
     */
    low_foil_cents?: number | null;
    /**
     * Cardmarket's trend price
     * @type {number}
     * @memberof PriceDayResponse
     */
    trend_cents?: number | null;
    /**
     * The foil trend price
     * @type {number}
     * @memberof PriceDayResponse
     */
    trend_foil_cents?: number | null;
}
/**
 * What a card has cost over time
 * @export
 * @interface PriceHistoryResponse
 */
export interface PriceHistoryResponse {
    /**
     * The days, oldest first
     * 
     * Daily for the last quarter and weekly before that — the history is thinned as it ages, so a chart should plot against the dates rather than against the position in this list.
     * @type {Array<PriceDayResponse>}
     * @memberof PriceHistoryResponse
     */
    days: Array<PriceDayResponse>;
}
/**
 * One stack in the market-versus-purchase comparison
 * @export
 * @interface PricePointResponse
 */
export interface PricePointResponse {
    /**
     * How many copies the stack holds
     * @type {number}
     * @memberof PricePointResponse
     */
    copies: number;
    /**
     * What one copy fetches today, in euro cents
     * @type {number}
     * @memberof PricePointResponse
     */
    market_cents: number;
    /**
     * The card's name
     * @type {string}
     * @memberof PricePointResponse
     */
    name: string;
    /**
     * What was paid per copy, in euro cents
     * @type {number}
     * @memberof PricePointResponse
     */
    purchase_cents: number;
}
/**
 * One language the same card exists in
 * @export
 * @interface PrintingLanguageResponse
 */
export interface PrintingLanguageResponse {
    /**
     * Scryfall's id of that language's printing — what a stack stores
     * @type {string}
     * @memberof PrintingLanguageResponse
     */
    id: string;
    /**
     * Artwork for a list row
     * @type {string}
     * @memberof PrintingLanguageResponse
     */
    image_small?: string | null;
    /**
     * The language, as Scryfall's code
     * @type {string}
     * @memberof PrintingLanguageResponse
     */
    lang: string;
}
/**
 * The languages a card was printed in
 * @export
 * @interface PrintingLanguagesResponse
 */
export interface PrintingLanguagesResponse {
    /**
     * One per language, English first, the printing asked about included
     * @type {Array<PrintingLanguageResponse>}
     * @memberof PrintingLanguagesResponse
     */
    languages: Array<PrintingLanguageResponse>;
}
/**
 * How one row of an import names the card it wants
 * 
 * Everything is optional because every exporter writes a different subset. What is present decides how precisely the card is named: an id names exactly one printing, a set code with a collector number names one card in every language, a name alone names a card but not which printing of it.
 * @export
 * @interface PrintingLookupRequest
 */
export interface PrintingLookupRequest {
    /**
     * Collector number as printed
     * @type {string}
     * @memberof PrintingLookupRequest
     */
    collector_number?: string | null;
    /**
     * Scryfall's id of the printing, when the export carried one
     * @type {string}
     * @memberof PrintingLookupRequest
     */
    id?: string | null;
    /**
     * The language the row is in, as Scryfall's code — English when absent
     * @type {string}
     * @memberof PrintingLookupRequest
     */
    lang?: string | null;
    /**
     * The printed name
     * @type {string}
     * @memberof PrintingLookupRequest
     */
    name?: string | null;
    /**
     * Set code, in any case
     * @type {string}
     * @memberof PrintingLookupRequest
     */
    set_code?: string | null;
}
/**
 * A collection somebody put on show
 * 
 * What a collection looks like to a stranger: no share token, and no figure in money — see [`redact_entry`] for the same line drawn on its cards.
 * 
 * [`redact_entry`]: crate::http::handler_frontend::shared::schema::redact_entry
 * @export
 * @interface PublicCollectionResponse
 */
export interface PublicCollectionResponse {
    /**
     * Artwork of the most valuable cards in it, at most two
     * @type {Array<string>}
     * @memberof PublicCollectionResponse
     */
    arts: Array<string>;
    /**
     * How many copies are filed in it
     * @type {number}
     * @memberof PublicCollectionResponse
     */
    cards: number;
    /**
     * The colour the collection is drawn in
     * @type {string}
     * @memberof PublicCollectionResponse
     */
    color: string;
    /**
     * The colours the collection holds, as the letters `WUBRG`
     * @type {string}
     * @memberof PublicCollectionResponse
     */
    colors: string;
    /**
     * The point in time the collection was created
     * @type {string}
     * @memberof PublicCollectionResponse
     */
    created_at: string;
    /**
     * Description shown above the card list
     * @type {string}
     * @memberof PublicCollectionResponse
     */
    description: string;
    /**
     * The pictogram drawn on the collection
     * @type {string}
     * @memberof PublicCollectionResponse
     */
    icon: string;
    /**
     * Name of the collection
     * @type {string}
     * @memberof PublicCollectionResponse
     */
    name: string;
    /**
     * The username of the account it belongs to
     * @type {string}
     * @memberof PublicCollectionResponse
     */
    owner: string;
    /**
     * Copies per rarity
     * @type {RarityCountsResponse}
     * @memberof PublicCollectionResponse
     */
    rarities: RarityCountsResponse;
    /**
     * Primary key
     * @type {string}
     * @memberof PublicCollectionResponse
     */
    uuid: string;
}
/**
 * A deck somebody put on show
 * @export
 * @interface PublicDeckResponse
 */
export interface PublicDeckResponse {
    /**
     * The colours it may play, `null` for whatever the commander allows
     * @type {string}
     * @memberof PublicDeckResponse
     */
    allowed_color_identity?: string | null;
    /**
     * Which Commander bracket the deck is built to, `null` when it claims none
     * @type {number}
     * @memberof PublicDeckResponse
     */
    bracket?: number | null;
    /**
     * How many cards sit in the deck proper, the sideboard aside
     * @type {number}
     * @memberof PublicDeckResponse
     */
    cards: number;
    /**
     * The commanders, in the order they were put in
     * @type {Array<DeckCommanderResponse>}
     * @memberof PublicDeckResponse
     */
    commanders: Array<DeckCommanderResponse>;
    /**
     * The point in time the deck was created
     * @type {string}
     * @memberof PublicDeckResponse
     */
    created_at: string;
    /**
     * Optional description, e.g. the deck's game plan
     * @type {string}
     * @memberof PublicDeckResponse
     */
    description?: string | null;
    /**
     * The format it is built for
     * @type {string}
     * @memberof PublicDeckResponse
     */
    format: string;
    /**
     * Name of the deck
     * @type {string}
     * @memberof PublicDeckResponse
     */
    name: string;
    /**
     * The username of the account that built it
     * @type {string}
     * @memberof PublicDeckResponse
     */
    owner: string;
    /**
     * What those cards are worth in euro cents
     * @type {number}
     * @memberof PublicDeckResponse
     */
    price_eur_cents: number;
    /**
     * Primary key
     * @type {string}
     * @memberof PublicDeckResponse
     */
    uuid: string;
}

/**
 * What a public deck listing is ordered by
 * @export
 */
export const PublicDeckSort = {
    /**
    * Newest first
    */
    Created: 'Created',
    /**
    * By the deck&#39;s name
    */
    Name: 'Name',
    /**
    * By how many cards it holds
    */
    Cards: 'Cards',
    /**
    * By what those cards are worth
    */
    Price: 'Price'
} as const;
export type PublicDeckSort = typeof PublicDeckSort[keyof typeof PublicDeckSort];

/**
 * An account, as far as strangers get to see it
 * @export
 * @interface PublicProfileResponse
 */
export interface PublicProfileResponse {
    /**
     * The collections it put on show, alphabetically
     * @type {Array<PublicCollectionResponse>}
     * @memberof PublicProfileResponse
     */
    collections: Array<PublicCollectionResponse>;
    /**
     * The point in time the account was created
     * @type {string}
     * @memberof PublicProfileResponse
     */
    created_at: string;
    /**
     * The decks it put on show, newest first
     * @type {Array<PublicDeckResponse>}
     * @memberof PublicProfileResponse
     */
    decks: Array<PublicDeckResponse>;
    /**
     * The account's login handle and display name
     * @type {string}
     * @memberof PublicProfileResponse
     */
    username: string;
}
/**
 * Copies per rarity in a collection
 * @export
 * @interface RarityCountsResponse
 */
export interface RarityCountsResponse {
    /**
     * Copies of common cards
     * @type {number}
     * @memberof RarityCountsResponse
     */
    common: number;
    /**
     * Copies of mythic rare cards
     * @type {number}
     * @memberof RarityCountsResponse
     */
    mythic: number;
    /**
     * Copies of everything else the catalog files separately
     * @type {number}
     * @memberof RarityCountsResponse
     */
    other: number;
    /**
     * Copies of rare cards
     * @type {number}
     * @memberof RarityCountsResponse
     */
    rare: number;
    /**
     * Copies of uncommon cards
     * @type {number}
     * @memberof RarityCountsResponse
     */
    uncommon: number;
}
/**
 * One card of a decklist read off another site
 * @export
 * @interface ReadDeckCardResponse
 */
export interface ReadDeckCardResponse {
    /**
     * The collector number, when the site says
     * @type {string}
     * @memberof ReadDeckCardResponse
     */
    collector_number?: string | null;
    /**
     * Whether the list asks for the foil copies
     * @type {boolean}
     * @memberof ReadDeckCardResponse
     */
    foil: boolean;
    /**
     * The card's name, to be placed in the catalog by the client
     * @type {string}
     * @memberof ReadDeckCardResponse
     */
    name: string;
    /**
     * How many copies
     * @type {number}
     * @memberof ReadDeckCardResponse
     */
    quantity: number;
    /**
     * The set it was printed in, when the site says
     * @type {string}
     * @memberof ReadDeckCardResponse
     */
    set_code?: string | null;
    /**
     * Which zone it sits in
     * @type {DeckZone}
     * @memberof ReadDeckCardResponse
     */
    zone: DeckZone;
}


/**
 * A link to a deck on another site
 * @export
 * @interface ReadDeckUrlRequest
 */
export interface ReadDeckUrlRequest {
    /**
     * The link, as it was copied out of the address bar
     * @type {string}
     * @memberof ReadDeckUrlRequest
     */
    url: string;
}
/**
 * A decklist read off another site
 * 
 * Deliberately not written to any deck: the cards are placed in the catalog by the client, exactly as a pasted list is, so both ways of importing end in the same place.
 * @export
 * @interface ReadDeckUrlResponse
 */
export interface ReadDeckUrlResponse {
    /**
     * The cards
     * @type {Array<ReadDeckCardResponse>}
     * @memberof ReadDeckUrlResponse
     */
    cards: Array<ReadDeckCardResponse>;
    /**
     * The format it is built for, as the site spells it
     * @type {string}
     * @memberof ReadDeckUrlResponse
     */
    format?: string | null;
    /**
     * What the deck is called there
     * @type {string}
     * @memberof ReadDeckUrlResponse
     */
    name: string;
}
/**
 * Request a fresh registration link for an existing account
 * 
 * The "lost passkey" flow. Deliberately no response and no errors: whether the username exists must not be readable from the answer, so the endpoint says `200` either way and sends mail only where there is an account.
 * @export
 * @interface RecoverAccountRequest
 */
export interface RecoverAccountRequest {
    /**
     * The language the recovery mail is written in
     * 
     * The client sends the language its UI is showing; left out, the mail falls back to German, the app's primary language.
     * @type {MailLanguage}
     * @memberof RecoverAccountRequest
     */
    language?: MailLanguage;
    /**
     * The username to recover
     * @type {any}
     * @memberof RecoverAccountRequest
     */
    username: any;
}


/**
 * Why a passkey registration could not be started or completed
 * @export
 * @interface RegistrationErrors
 */
export interface RegistrationErrors {
    /**
     * This authenticator already holds a passkey for this account
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    already_registered: boolean;
    /**
     * The browser's response was not a credential
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    malformed_credential: boolean;
    /**
     * No ceremony is in progress — the session expired, or `register/start` was never called
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    no_ceremony: boolean;
    /**
     * The credential did not check out
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    registration_failed: boolean;
    /**
     * The token is past its validity
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    token_expired: boolean;
    /**
     * No such registration token
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    token_invalid: boolean;
    /**
     * The token was already used to register a passkey
     * @type {boolean}
     * @memberof RegistrationErrors
     */
    token_used: boolean;
}
/**
 * A list of cards to place in the catalog
 * @export
 * @interface ResolvePrintingsRequest
 */
export interface ResolvePrintingsRequest {
    /**
     * The rows to look up, in any order
     * @type {Array<PrintingLookupRequest>}
     * @memberof ResolvePrintingsRequest
     */
    lookups: Array<PrintingLookupRequest>;
}
/**
 * What the catalog could place
 * @export
 * @interface ResolvePrintingsResponse
 */
export interface ResolvePrintingsResponse {
    /**
     * The printings, each naming the lookup it answers
     * 
     * A lookup no printing names is one the catalog holds no card for. That is an answer, not a failure — the row has to be reported as unmatched rather than dropped, and a card the catalog does not know cannot be filed anyway.
     * @type {Array<ResolvedPrintingResponse>}
     * @memberof ResolvePrintingsResponse
     */
    printings: Array<ResolvedPrintingResponse>;
}
/**
 * What the catalog knows about a card an import asked for
 * @export
 * @interface ResolvedPrintingResponse
 */
export interface ResolvedPrintingResponse {
    /**
     * Collector number as printed
     * @type {string}
     * @memberof ResolvedPrintingResponse
     */
    collector_number: string;
    /**
     * The finishes this printing exists in, as Scryfall spells them
     * @type {Array<string>}
     * @memberof ResolvedPrintingResponse
     */
    finishes: Array<string>;
    /**
     * Scryfall's id of the printing — what a collection entry stores
     * @type {string}
     * @memberof ResolvedPrintingResponse
     */
    id: string;
    /**
     * Language of this printing, as Scryfall's code
     * @type {string}
     * @memberof ResolvedPrintingResponse
     */
    lang: string;
    /**
     * Which lookup this answers, as its position in the request
     * 
     * Answers carry their question rather than the list carrying a hole per unmatched row: a five-figure import is mostly cards the catalog knows, and the few it does not are what the client reports as unmatched.
     * @type {number}
     * @memberof ResolvedPrintingResponse
     */
    lookup: number;
    /**
     * The printed name
     * @type {string}
     * @memberof ResolvedPrintingResponse
     */
    name: string;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof ResolvedPrintingResponse
     */
    set_code: string;
    /**
     * Full set name
     * @type {string}
     * @memberof ResolvedPrintingResponse
     */
    set_name: string;
}
/**
 * Request to sort everything in the deck back where it came from
 * @export
 * @interface ReturnAllDeckCardsRequest
 */
export interface ReturnAllDeckCardsRequest {
    /**
     * Where stacks without an origin go, `None` to leave those in the deck
     * @type {string}
     * @memberof ReturnAllDeckCardsRequest
     */
    target?: string | null;
}
/**
 * What sorting a deck back moved
 * @export
 * @interface ReturnAllDeckCardsResponse
 */
export interface ReturnAllDeckCardsResponse {
    /**
     * How many stayed, because nobody said where they belong
     * @type {number}
     * @memberof ReturnAllDeckCardsResponse
     */
    left: number;
    /**
     * How many stacks were sorted back
     * @type {number}
     * @memberof ReturnAllDeckCardsResponse
     */
    returned: number;
}
/**
 * Request to sort copies out of the deck back into a collection
 * @export
 * @interface ReturnDeckCardsRequest
 */
export interface ReturnDeckCardsRequest {
    /**
     * The stack in the deck to take them from
     * @type {string}
     * @memberof ReturnDeckCardsRequest
     */
    entry: string;
    /**
     * How many copies to sort back
     * @type {number}
     * @memberof ReturnDeckCardsRequest
     */
    quantity: number;
    /**
     * Where to put them, `None` to use where they came from
     * @type {string}
     * @memberof ReturnDeckCardsRequest
     */
    target?: string | null;
}
/**
 * The freshly minted secret of a deck's share link
 * @export
 * @interface RotateDeckShareTokenResponse
 */
export interface RotateDeckShareTokenResponse {
    /**
     * The new secret — every link handed out before this call stopped working
     * @type {string}
     * @memberof RotateDeckShareTokenResponse
     */
    share_token: string;
}
/**
 * The freshly minted secret of a collection's share link
 * @export
 * @interface RotateShareTokenResponse
 */
export interface RotateShareTokenResponse {
    /**
     * The new secret — every link handed out before this call stopped working
     * @type {string}
     * @memberof RotateShareTokenResponse
     */
    share_token: string;
}
/**
 * One page of the decks their owners put on show
 * @export
 * @interface SearchPublicDecksResponse
 */
export interface SearchPublicDecksResponse {
    /**
     * The decks on this page
     * @type {Array<PublicDeckResponse>}
     * @memberof SearchPublicDecksResponse
     */
    decks: Array<PublicDeckResponse>;
    /**
     * How many decks were asked for
     * @type {number}
     * @memberof SearchPublicDecksResponse
     */
    limit: number;
    /**
     * How many decks were skipped
     * @type {number}
     * @memberof SearchPublicDecksResponse
     */
    offset: number;
    /**
     * How many decks the search found in total
     * @type {number}
     * @memberof SearchPublicDecksResponse
     */
    total: number;
}
/**
 * One set's share of the collection
 * @export
 * @interface SetBucketResponse
 */
export interface SetBucketResponse {
    /**
     * Copies from this set
     * @type {number}
     * @memberof SetBucketResponse
     */
    cards: number;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof SetBucketResponse
     */
    set_code: string;
    /**
     * Full set name
     * @type {string}
     * @memberof SetBucketResponse
     */
    set_name: string;
    /**
     * What those copies are worth, in euro cents
     * @type {number}
     * @memberof SetBucketResponse
     */
    value_cents: number;
}
/**
 * Request to change who may see a collection
 * @export
 * @interface SetCollectionVisibilityRequest
 */
export interface SetCollectionVisibilityRequest {
    /**
     * The visibility to switch to
     * @type {Visibility}
     * @memberof SetCollectionVisibilityRequest
     */
    visibility: Visibility;
}


/**
 * Request to say which Commander bracket a deck is built to
 * @export
 * @interface SetDeckBracketRequest
 */
export interface SetDeckBracketRequest {
    /**
     * The bracket, one to five, or `null` to leave it unsaid
     * @type {number}
     * @memberof SetDeckBracketRequest
     */
    bracket?: number | null;
}
/**
 * Request to overrule which colours a deck may play
 * @export
 * @interface SetDeckColorsRequest
 */
export interface SetDeckColorsRequest {
    /**
     * The colours as the letters `WUBRG`, or `null` to follow the commander
     * @type {string}
     * @memberof SetDeckColorsRequest
     */
    colors?: string | null;
}
/**
 * Request to file a deck into a folder, or onto no shelf at all
 * @export
 * @interface SetDeckFolderRequest
 */
export interface SetDeckFolderRequest {
    /**
     * The folder to file it in, `null` to take it off every shelf
     * @type {string}
     * @memberof SetDeckFolderRequest
     */
    folder?: string | null;
}
/**
 * Request to record the house rules a deck is played under
 * @export
 * @interface SetDeckRuleZeroRequest
 */
export interface SetDeckRuleZeroRequest {
    /**
     * Whether the table agreed to cards the format bans
     * @type {boolean}
     * @memberof SetDeckRuleZeroRequest
     */
    allow_banned: boolean;
    /**
     * Whether the table agreed to multiple copies of a card
     * @type {boolean}
     * @memberof SetDeckRuleZeroRequest
     */
    allow_duplicates: boolean;
    /**
     * Whether the table agreed to more than the format's commanders
     * @type {boolean}
     * @memberof SetDeckRuleZeroRequest
     */
    allow_extra_commanders: boolean;
    /**
     * How many cards the deck is built to, `null` for the format's rule
     * @type {number}
     * @memberof SetDeckRuleZeroRequest
     */
    deck_size?: number | null;
}
/**
 * Request to change who may see a deck
 * @export
 * @interface SetDeckVisibilityRequest
 */
export interface SetDeckVisibilityRequest {
    /**
     * The visibility to switch to
     * @type {Visibility}
     * @memberof SetDeckVisibilityRequest
     */
    visibility: Visibility;
}


/**
 * A collection as the holder of its share link sees it
 * @export
 * @interface SharedCollectionResponse
 */
export interface SharedCollectionResponse {
    /**
     * The point in time the collection was created
     * @type {string}
     * @memberof SharedCollectionResponse
     */
    created_at: string;
    /**
     * Description shown above the card list
     * @type {string}
     * @memberof SharedCollectionResponse
     */
    description: string;
    /**
     * Name of the collection
     * @type {string}
     * @memberof SharedCollectionResponse
     */
    name: string;
    /**
     * Display name of the account the collection belongs to
     * @type {string}
     * @memberof SharedCollectionResponse
     */
    owner: string;
}
/**
 * A deck as the holder of its share link sees it
 * @export
 * @interface SharedDeckResponse
 */
export interface SharedDeckResponse {
    /**
     * The colours the deck may play, `null` for whatever the commander allows
     * @type {string}
     * @memberof SharedDeckResponse
     */
    allowed_color_identity?: string | null;
    /**
     * The point in time the deck was created
     * @type {string}
     * @memberof SharedDeckResponse
     */
    created_at: string;
    /**
     * Optional description, e.g. the deck's game plan
     * @type {string}
     * @memberof SharedDeckResponse
     */
    description?: string | null;
    /**
     * The format the deck is built for
     * @type {string}
     * @memberof SharedDeckResponse
     */
    format: string;
    /**
     * Name of the deck
     * @type {string}
     * @memberof SharedDeckResponse
     */
    name: string;
    /**
     * Display name of the account the deck belongs to
     * @type {string}
     * @memberof SharedDeckResponse
     */
    owner: string;
}
/**
 * @type Signup200Response
 * 
 * @export
 */
export type Signup200Response = FormErrorResponseForSignupErrors | SignupResponse;
/**
 * Why a signup request was rejected, for the form to show on the offending field
 * 
 * Only the username is ever reported: profiles are reachable by name, so whether one is taken is public anyway. Whether an *email address* is already in use stays unrevealable — that request still answers `200` and simply sends no mail.
 * @export
 * @interface SignupErrors
 */
export interface SignupErrors {
    /**
     * The email address is not shaped like one
     * @type {boolean}
     * @memberof SignupErrors
     */
    email_malformed: boolean;
    /**
     * The username belongs to an account that has already finished its registration
     * @type {boolean}
     * @memberof SignupErrors
     */
    username_taken: boolean;
}
/**
 * Request to sign up for a new account
 * @export
 * @interface SignupRequest
 */
export interface SignupRequest {
    /**
     * The email address the registration link is sent to
     * @type {string}
     * @memberof SignupRequest
     */
    email: string;
    /**
     * The language the registration mail is written in
     * 
     * The client sends the language its UI is showing; left out, the mail falls back to German, the app's primary language.
     * @type {MailLanguage}
     * @memberof SignupRequest
     */
    language?: MailLanguage;
    /**
     * The desired username
     * @type {any}
     * @memberof SignupRequest
     */
    username: any;
}


/**
 * Response to an accepted signup request
 * @export
 * @interface SignupResponse
 */
export interface SignupResponse {
    /**
     * The username the registration link is for
     * 
     * Echoed back so the confirmation screen can name the account without claiming which address the mail went to — for a re-issued invite that is the address already on the account, not the one just typed.
     * @type {string}
     * @memberof SignupResponse
     */
    username: string;
}
/**
 * A passkey registered on the account
 * @export
 * @interface SimplePasskey
 */
export interface SimplePasskey {
    /**
     * When the passkey was registered
     * @type {string}
     * @memberof SimplePasskey
     */
    created_at: string;
    /**
     * Human-readable device label
     * @type {string}
     * @memberof SimplePasskey
     */
    label: string;
    /**
     * When the passkey was last used to log in, if ever
     * @type {string}
     * @memberof SimplePasskey
     */
    last_used_at?: string | null;
    /**
     * The passkey's primary key
     * @type {string}
     * @memberof SimplePasskey
     */
    uuid: string;
}
/**
 * What the catalog knows about a card the sourcing view shows
 * @export
 * @interface SourcedPrintingResponse
 */
export interface SourcedPrintingResponse {
    /**
     * Cardmarket's id of the product this printing is sold as
     * @type {number}
     * @memberof SourcedPrintingResponse
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     * @type {string}
     * @memberof SourcedPrintingResponse
     */
    collector_number: string;
    /**
     * Artwork for a tile, which a row-sized scan is too small for
     * @type {string}
     * @memberof SourcedPrintingResponse
     */
    image_normal?: string | null;
    /**
     * Artwork for a list row
     * @type {string}
     * @memberof SourcedPrintingResponse
     */
    image_small?: string | null;
    /**
     * Language of the printing
     * @type {string}
     * @memberof SourcedPrintingResponse
     */
    lang: string;
    /**
     * The printed name
     * @type {string}
     * @memberof SourcedPrintingResponse
     */
    name: string;
    /**
     * Groups every printing of the same card, which is what a wider match uses
     * @type {string}
     * @memberof SourcedPrintingResponse
     */
    oracle_id?: string | null;
    /**
     * What a copy costs, in euro cents
     * @type {number}
     * @memberof SourcedPrintingResponse
     */
    price_eur_cents?: number | null;
    /**
     * What a foil copy costs, in euro cents
     * @type {number}
     * @memberof SourcedPrintingResponse
     */
    price_eur_foil_cents?: number | null;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof SourcedPrintingResponse
     */
    set_code: string;
    /**
     * Full set name
     * @type {string}
     * @memberof SourcedPrintingResponse
     */
    set_name: string;
}
/**
 * One stack lying in the deck's own collection
 * @export
 * @interface SourcedStackResponse
 */
export interface SourcedStackResponse {
    /**
     * What the catalog knows about the printing
     * @type {SourcedPrintingResponse}
     * @memberof SourcedStackResponse
     */
    card?: SourcedPrintingResponse | null;
    /**
     * Condition of the cards
     * @type {CardCondition}
     * @memberof SourcedStackResponse
     */
    condition: CardCondition;
    /**
     * Finish of the cards
     * @type {CardFinish}
     * @memberof SourcedStackResponse
     */
    finish: CardFinish;
    /**
     * The collection they were taken out of, `None` if they were bought into it
     * @type {string}
     * @memberof SourcedStackResponse
     */
    origin?: string | null;
    /**
     * Its marker colour
     * @type {string}
     * @memberof SourcedStackResponse
     */
    origin_color?: string | null;
    /**
     * Its marker pictogram
     * @type {string}
     * @memberof SourcedStackResponse
     */
    origin_icon?: string | null;
    /**
     * What that collection is called, `None` once it is gone
     * @type {string}
     * @memberof SourcedStackResponse
     */
    origin_name?: string | null;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof SourcedStackResponse
     */
    printing: string;
    /**
     * How many copies the stack holds
     * @type {number}
     * @memberof SourcedStackResponse
     */
    quantity: number;
    /**
     * Primary key of the stack
     * @type {string}
     * @memberof SourcedStackResponse
     */
    uuid: string;
}


/**
 * One stack elsewhere in the account that could fill a slot
 * @export
 * @interface SourcingCandidateResponse
 */
export interface SourcingCandidateResponse {
    /**
     * What the catalog knows about the printing
     * @type {SourcedPrintingResponse}
     * @memberof SourcingCandidateResponse
     */
    card: SourcedPrintingResponse;
    /**
     * The collection it lies in
     * @type {string}
     * @memberof SourcingCandidateResponse
     */
    collection: string;
    /**
     * Its marker colour
     * @type {string}
     * @memberof SourcingCandidateResponse
     */
    collection_color: string;
    /**
     * The deck it stands for, so taking from another deck is visibly that
     * @type {string}
     * @memberof SourcingCandidateResponse
     */
    collection_deck?: string | null;
    /**
     * Its marker pictogram
     * @type {string}
     * @memberof SourcingCandidateResponse
     */
    collection_icon: string;
    /**
     * What that collection is called
     * @type {string}
     * @memberof SourcingCandidateResponse
     */
    collection_name: string;
    /**
     * Condition of the cards
     * @type {CardCondition}
     * @memberof SourcingCandidateResponse
     */
    condition: CardCondition;
    /**
     * Finish of the cards
     * @type {CardFinish}
     * @memberof SourcingCandidateResponse
     */
    finish: CardFinish;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof SourcingCandidateResponse
     */
    printing: string;
    /**
     * How many copies the stack holds
     * @type {number}
     * @memberof SourcingCandidateResponse
     */
    quantity: number;
    /**
     * Primary key of the stack
     * @type {string}
     * @memberof SourcingCandidateResponse
     */
    uuid: string;
}


/**
 * One slot of the deck list, as the sourcing view sees it
 * @export
 * @interface SourcingSlotResponse
 */
export interface SourcingSlotResponse {
    /**
     * What the catalog knows, `None` for a printing it has not caught up with
     * @type {SourcedPrintingResponse}
     * @memberof SourcingSlotResponse
     */
    card?: SourcedPrintingResponse | null;
    /**
     * Whether the list asks for foils
     * @type {boolean}
     * @memberof SourcingSlotResponse
     */
    foil: boolean;
    /**
     * Scryfall's id of the printing the list asks for
     * @type {string}
     * @memberof SourcingSlotResponse
     */
    printing: string;
    /**
     * How many copies it asks for
     * @type {number}
     * @memberof SourcingSlotResponse
     */
    quantity: number;
    /**
     * Primary key of the slot
     * @type {string}
     * @memberof SourcingSlotResponse
     */
    uuid: string;
    /**
     * Which zone the slot sits in
     * @type {DeckZone}
     * @memberof SourcingSlotResponse
     */
    zone: DeckZone;
}


/**
 * Request to move copies out of a stack into a new one
 * @export
 * @interface SplitCollectionEntryRequest
 */
export interface SplitCollectionEntryRequest {
    /**
     * The day the split-off cards were acquired; inherited when omitted, `null` clears it
     * @type {string}
     * @memberof SplitCollectionEntryRequest
     */
    acquired_at?: string | null;
    /**
     * The condition of the split-off cards; inherited when omitted
     * @type {CardCondition}
     * @memberof SplitCollectionEntryRequest
     */
    condition?: CardCondition | null;
    /**
     * The finish of the split-off cards; inherited when omitted
     * @type {CardFinish}
     * @memberof SplitCollectionEntryRequest
     */
    finish?: CardFinish | null;
    /**
     * What was paid per copy, in euro cents; inherited when omitted, `null` clears it
     * @type {number}
     * @memberof SplitCollectionEntryRequest
     */
    purchase_price_cents?: number | null;
    /**
     * How many copies move out — fewer than the stack holds
     * @type {number}
     * @memberof SplitCollectionEntryRequest
     */
    quantity: number;
    /**
     * Whether the split-off cards carry a signature; inherited when omitted
     * @type {boolean}
     * @memberof SplitCollectionEntryRequest
     */
    signed?: boolean | null;
}


/**
 * The two stacks a split leaves behind
 * @export
 * @interface SplitCollectionEntryResponse
 */
export interface SplitCollectionEntryResponse {
    /**
     * The stack the copies moved into
     * @type {CollectionEntryResponse}
     * @memberof SplitCollectionEntryResponse
     */
    created: CollectionEntryResponse;
    /**
     * The original stack, now holding the copies that stayed
     * @type {CollectionEntryResponse}
     * @memberof SplitCollectionEntryResponse
     */
    source: CollectionEntryResponse;
}
/**
 * Response to a started add-passkey ceremony
 * @export
 * @interface StartAddPasskeyResponse
 */
export interface StartAddPasskeyResponse {
    /**
     * `PublicKeyCredentialCreationOptions` to pass to the browser
     * @type {any}
     * @memberof StartAddPasskeyResponse
     */
    options: any | null;
}
/**
 * @type StartLogin200Response
 * 
 * @export
 */
export type StartLogin200Response = FormErrorResponseForStartLoginErrors | StartLoginResponse;
/**
 * Why a login could not be started
 * @export
 * @interface StartLoginErrors
 */
export interface StartLoginErrors {
    /**
     * No account by that name, or it has no passkey — deliberately the same flag, so the endpoint does not say which usernames are actually able to log in
     * @type {boolean}
     * @memberof StartLoginErrors
     */
    unknown_username: boolean;
}
/**
 * Request to start a login ceremony
 * @export
 * @interface StartLoginRequest
 */
export interface StartLoginRequest {
    /**
     * The username to log in as
     * @type {any}
     * @memberof StartLoginRequest
     */
    username: any;
}
/**
 * Response to a started login ceremony
 * @export
 * @interface StartLoginResponse
 */
export interface StartLoginResponse {
    /**
     * `PublicKeyCredentialRequestOptions` to pass to the browser
     * @type {any}
     * @memberof StartLoginResponse
     */
    options: any | null;
}
/**
 * @type StartRegistration200Response
 * 
 * @export
 */
export type StartRegistration200Response = FormErrorResponseForRegistrationErrors | StartRegistrationResponse;
/**
 * Request to start a registration ceremony
 * @export
 * @interface StartRegistrationRequest
 */
export interface StartRegistrationRequest {
    /**
     * The token from the registration link
     * @type {string}
     * @memberof StartRegistrationRequest
     */
    token: string;
}
/**
 * Response to a started registration ceremony
 * @export
 * @interface StartRegistrationResponse
 */
export interface StartRegistrationResponse {
    /**
     * `PublicKeyCredentialCreationOptions` to pass to the browser
     * @type {any}
     * @memberof StartRegistrationResponse
     */
    options: any | null;
    /**
     * The username the passkey will be registered for
     * @type {string}
     * @memberof StartRegistrationResponse
     */
    username: string;
}
/**
 * A labelled count of copies
 * 
 * The key is a stable slug — a colour letter, a type slug, a bucket name — which the client turns into a label; raw data such as artist names and set codes pass through as they are.
 * @export
 * @interface StatBucketResponse
 */
export interface StatBucketResponse {
    /**
     * Copies in it
     * @type {number}
     * @memberof StatBucketResponse
     */
    cards: number;
    /**
     * Identifies the bucket
     * @type {string}
     * @memberof StatBucketResponse
     */
    key: string;
}
/**
 * Request to move copies out of a collection and into the deck
 * @export
 * @interface TakeDeckCardsRequest
 */
export interface TakeDeckCardsRequest {
    /**
     * The stack to take them from
     * @type {string}
     * @memberof TakeDeckCardsRequest
     */
    entry: string;
    /**
     * How many copies to take
     * @type {number}
     * @memberof TakeDeckCardsRequest
     */
    quantity: number;
    /**
     * The slot they are being sourced for, which then follows the printing
     * @type {string}
     * @memberof TakeDeckCardsRequest
     */
    slot?: string | null;
}
/**
 * One point of the acquisition timeline
 * @export
 * @interface TimelinePointResponse
 */
export interface TimelinePointResponse {
    /**
     * Copies owned by the end of that month
     * @type {number}
     * @memberof TimelinePointResponse
     */
    cards: number;
    /**
     * The month as `YYYY-MM`
     * @type {string}
     * @memberof TimelinePointResponse
     */
    month: string;
    /**
     * What those copies are worth today, in euro cents
     * @type {number}
     * @memberof TimelinePointResponse
     */
    value_cents: number;
}
/**
 * A stack worth calling out
 * @export
 * @interface TopCardResponse
 */
export interface TopCardResponse {
    /**
     * Copies in the stack
     * @type {number}
     * @memberof TopCardResponse
     */
    copies: number;
    /**
     * Artwork for a list row
     * @type {string}
     * @memberof TopCardResponse
     */
    image_small?: string | null;
    /**
     * The card's name
     * @type {string}
     * @memberof TopCardResponse
     */
    name: string;
    /**
     * Scryfall's id of the printing
     * @type {string}
     * @memberof TopCardResponse
     */
    printing: string;
    /**
     * Full set name
     * @type {string}
     * @memberof TopCardResponse
     */
    set_name: string;
    /**
     * The entry it came from
     * @type {string}
     * @memberof TopCardResponse
     */
    uuid: string;
    /**
     * What the whole stack is worth, in euro cents
     * @type {number}
     * @memberof TopCardResponse
     */
    value_cents: number;
}
/**
 * Request to change some of a stack's fields
 * 
 * Every field is optional and an omitted one is left alone. The two nullable ones are wrapped twice so that `null` can mean "clear this": with a single `Option` a cleared price and an untouched one arrive as the same value.
 * @export
 * @interface UpdateCollectionEntryRequest
 */
export interface UpdateCollectionEntryRequest {
    /**
     * The day the cards were acquired; `null` clears it
     * @type {string}
     * @memberof UpdateCollectionEntryRequest
     */
    acquired_at?: string | null;
    /**
     * The condition the cards are in
     * @type {CardCondition}
     * @memberof UpdateCollectionEntryRequest
     */
    condition?: CardCondition | null;
    /**
     * The finish the cards have
     * @type {CardFinish}
     * @memberof UpdateCollectionEntryRequest
     */
    finish?: CardFinish | null;
    /**
     * Scryfall's id of the printing — send this to correct a mis-identified card
     * @type {string}
     * @memberof UpdateCollectionEntryRequest
     */
    printing?: string | null;
    /**
     * What was paid per copy, in euro cents; `null` clears it
     * @type {number}
     * @memberof UpdateCollectionEntryRequest
     */
    purchase_price_cents?: number | null;
    /**
     * The new count
     * @type {number}
     * @memberof UpdateCollectionEntryRequest
     */
    quantity?: number | null;
    /**
     * Whether the cards carry an artist's signature
     * @type {boolean}
     * @memberof UpdateCollectionEntryRequest
     */
    signed?: boolean | null;
}


/**
 * 
 * @export
 * @interface UpdateCollectionRequest
 */
export interface UpdateCollectionRequest {
    /**
     * The colour the collection is drawn in
     * @type {string}
     * @memberof UpdateCollectionRequest
     */
    color: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateCollectionRequest
     */
    description: string;
    /**
     * The pictogram drawn on the collection
     * @type {string}
     * @memberof UpdateCollectionRequest
     */
    icon: string;
    /**
     * 
     * @type {string}
     * @memberof UpdateCollectionRequest
     */
    name: string;
}
/**
 * Request to change some of a slot's fields, leaving the rest alone
 * @export
 * @interface UpdateDeckCardRequest
 */
export interface UpdateDeckCardRequest {
    /**
     * Whether the copies in this slot are the foil ones
     * @type {boolean}
     * @memberof UpdateDeckCardRequest
     */
    foil?: boolean | null;
    /**
     * Scryfall's id of the printing — send this to sleeve a different print
     * @type {string}
     * @memberof UpdateDeckCardRequest
     */
    printing?: string | null;
    /**
     * The new count
     * @type {number}
     * @memberof UpdateDeckCardRequest
     */
    quantity?: number | null;
    /**
     * The zone to move it to
     * @type {DeckZone}
     * @memberof UpdateDeckCardRequest
     */
    zone?: DeckZone | null;
}


/**
 * Request to rename a folder
 * @export
 * @interface UpdateDeckFolderRequest
 */
export interface UpdateDeckFolderRequest {
    /**
     * What it is called now
     * @type {string}
     * @memberof UpdateDeckFolderRequest
     */
    name: string;
}
/**
 * Request to rename a deck, change its description or its format
 * @export
 * @interface UpdateDeckRequest
 */
export interface UpdateDeckRequest {
    /**
     * Optional description
     * @type {string}
     * @memberof UpdateDeckRequest
     */
    description?: string | null;
    /**
     * The format to build for
     * @type {string}
     * @memberof UpdateDeckRequest
     */
    format: string;
    /**
     * Name of the deck
     * @type {string}
     * @memberof UpdateDeckRequest
     */
    name: string;
}
/**
 * Request to rename a tag, change its marker or change which decks it is offered on
 * @export
 * @interface UpdateDeckTagRequest
 */
export interface UpdateDeckTagRequest {
    /**
     * The colour it is drawn in
     * @type {string}
     * @memberof UpdateDeckTagRequest
     */
    color: string;
    /**
     * Whether assignments follow the card through every deck and printing
     * @type {boolean}
     * @memberof UpdateDeckTagRequest
     */
    global: boolean;
    /**
     * The icon drawn inside its colour marker
     * @type {string}
     * @memberof UpdateDeckTagRequest
     */
    icon: string;
    /**
     * What the tag is called
     * @type {string}
     * @memberof UpdateDeckTagRequest
     */
    name: string;
}
/**
 * Request to rename a card-wide tag or change its marker
 * @export
 * @interface UpdateGlobalTagRequest
 */
export interface UpdateGlobalTagRequest {
    /**
     * The colour it is drawn in
     * @type {string}
     * @memberof UpdateGlobalTagRequest
     */
    color: string;
    /**
     * The icon drawn inside its colour marker
     * @type {string}
     * @memberof UpdateGlobalTagRequest
     */
    icon: string;
    /**
     * What the tag is called
     * @type {string}
     * @memberof UpdateGlobalTagRequest
     */
    name: string;
}
/**
 * Request to change some of an entry's fields, leaving the rest alone
 * 
 * Anything the alarm reads disarms it when it changes: the stored alarm is a comparison between one price and one threshold, and once either side moves it no longer describes anything. The next catalog sync sets it again if it still holds.
 * @export
 * @interface UpdateWatchListEntryRequest
 */
export interface UpdateWatchListEntryRequest {
    /**
     * Alarm below this price in euro cents; `null` takes the alarm off
     * @type {number}
     * @memberof UpdateWatchListEntryRequest
     */
    alarm_price_cents?: number | null;
    /**
     * Whether only the named printing counts
     * @type {boolean}
     * @memberof UpdateWatchListEntryRequest
     */
    exact_printing?: boolean | null;
    /**
     * A different finish
     * @type {CardFinish}
     * @memberof UpdateWatchListEntryRequest
     */
    finish?: CardFinish | null;
    /**
     * Which languages count; an empty list means any
     * @type {Array<string>}
     * @memberof UpdateWatchListEntryRequest
     */
    languages?: Array<string> | null;
    /**
     * Whether only the named finish counts
     * @type {boolean}
     * @memberof UpdateWatchListEntryRequest
     */
    match_finish?: boolean | null;
    /**
     * What the entry is for
     * @type {string}
     * @memberof UpdateWatchListEntryRequest
     */
    note?: string | null;
    /**
     * A different printing
     * @type {string}
     * @memberof UpdateWatchListEntryRequest
     */
    printing?: string | null;
    /**
     * How many copies the account is after
     * @type {number}
     * @memberof UpdateWatchListEntryRequest
     */
    wanted?: number | null;
}


/**
 * Request to rename a watch list or change its marker
 * @export
 * @interface UpdateWatchListRequest
 */
export interface UpdateWatchListRequest {
    /**
     * The colour it is drawn in
     * @type {string}
     * @memberof UpdateWatchListRequest
     */
    color: string;
    /**
     * Description shown above the entries
     * @type {string}
     * @memberof UpdateWatchListRequest
     */
    description: string;
    /**
     * The pictogram drawn on it
     * @type {string}
     * @memberof UpdateWatchListRequest
     */
    icon: string;
    /**
     * What the list is called
     * @type {string}
     * @memberof UpdateWatchListRequest
     */
    name: string;
}

/**
 * Who may see a collection or a deck
 * 
 * [`Self::Unlisted`] is not resolved by the ordinary visibility check — the share token is the authorization for those, not the viewer's identity.
 * @export
 */
export const Visibility = {
    /**
    * Listed on the owner&#39;s public profile
    */
    Public: 'Public',
    /**
    * Anyone who knows the share link
    */
    Unlisted: 'Unlisted',
    /**
    * Only the owner
    */
    Private: 'Private'
} as const;
export type Visibility = typeof Visibility[keyof typeof Visibility];

/**
 * One alarm that has gone off, as the navigation badge shows it
 * @export
 * @interface WatchListAlarmResponse
 */
export interface WatchListAlarmResponse {
    /**
     * The threshold it fell through, in euro cents
     * @type {number}
     * @memberof WatchListAlarmResponse
     */
    alarm_price_cents?: number | null;
    /**
     * The entry whose alarm went off
     * @type {string}
     * @memberof WatchListAlarmResponse
     */
    entry: string;
    /**
     * The printed name of the card, empty while the catalog misses it
     * @type {string}
     * @memberof WatchListAlarmResponse
     */
    name: string;
    /**
     * When it went off
     * @type {string}
     * @memberof WatchListAlarmResponse
     */
    triggered_at: string;
    /**
     * What the card cost when the alarm went off, in euro cents
     * @type {number}
     * @memberof WatchListAlarmResponse
     */
    triggered_price_cents?: number | null;
    /**
     * The list the entry sits on
     * @type {string}
     * @memberof WatchListAlarmResponse
     */
    watch_list: string;
    /**
     * What that list is called
     * @type {string}
     * @memberof WatchListAlarmResponse
     */
    watch_list_name: string;
}
/**
 * One card on a watch list, with everything the row shows
 * @export
 * @interface WatchListEntryResponse
 */
export interface WatchListEntryResponse {
    /**
     * Whether the reader has seen the alarm
     * @type {boolean}
     * @memberof WatchListEntryResponse
     */
    acknowledged: boolean;
    /**
     * Alarm below this price in euro cents, `None` for an entry without one
     * @type {number}
     * @memberof WatchListEntryResponse
     */
    alarm_price_cents?: number | null;
    /**
     * What the catalog knows, `None` for a printing it has not caught up with
     * @type {WatchedCardResponse}
     * @memberof WatchListEntryResponse
     */
    card?: WatchedCardResponse | null;
    /**
     * The point in time the entry was added
     * @type {string}
     * @memberof WatchListEntryResponse
     */
    created_at: string;
    /**
     * Whether only this very printing counts
     * @type {boolean}
     * @memberof WatchListEntryResponse
     */
    exact_printing: boolean;
    /**
     * The finish that is wanted
     * @type {CardFinish}
     * @memberof WatchListEntryResponse
     */
    finish: CardFinish;
    /**
     * Which languages count, as Scryfall's codes, empty for any
     * 
     * Only in force while the printing is not pinned: a pinned printing is already one language.
     * @type {Array<string>}
     * @memberof WatchListEntryResponse
     */
    languages: Array<string>;
    /**
     * The printing the price and the alarm actually refer to
     * 
     * For an entry that watches one printing this is that printing. For a wide one it is the cheapest print of the card the switches accept, which is a different card than the row is named after — so it carries its own identity, and a shop link opens the product that actually costs what the row says. `None` when the catalog prices nothing the entry accepts.
     * @type {WatchedMarketResponse}
     * @memberof WatchListEntryResponse
     */
    market?: WatchedMarketResponse | null;
    /**
     * Whether only the entry's finish counts
     * @type {boolean}
     * @memberof WatchListEntryResponse
     */
    match_finish: boolean;
    /**
     * What the entry is for, in the account's own words
     * @type {string}
     * @memberof WatchListEntryResponse
     */
    note: string;
    /**
     * Scryfall's id of the printing the entry names
     * @type {string}
     * @memberof WatchListEntryResponse
     */
    printing: string;
    /**
     * What the account already holds
     * @type {WatchedStockResponse}
     * @memberof WatchListEntryResponse
     */
    stock: WatchedStockResponse;
    /**
     * When the price last fell through the alarm, `None` while it has not
     * @type {string}
     * @memberof WatchListEntryResponse
     */
    triggered_at?: string | null;
    /**
     * What the card cost when the alarm went off, in euro cents
     * @type {number}
     * @memberof WatchListEntryResponse
     */
    triggered_price_cents?: number | null;
    /**
     * Which printing was that cheap
     * @type {string}
     * @memberof WatchListEntryResponse
     */
    triggered_printing?: string | null;
    /**
     * Primary key
     * @type {string}
     * @memberof WatchListEntryResponse
     */
    uuid: string;
    /**
     * How many copies the account is after
     * @type {number}
     * @memberof WatchListEntryResponse
     */
    wanted: number;
}


/**
 * One watch list as the overview grid shows it
 * @export
 * @interface WatchListOverviewResponse
 */
export interface WatchListOverviewResponse {
    /**
     * How many entries have a standing alarm
     * @type {number}
     * @memberof WatchListOverviewResponse
     */
    alarms: number;
    /**
     * Artwork of the dearest entries, at most two
     * @type {Array<string>}
     * @memberof WatchListOverviewResponse
     */
    arts: Array<string>;
    /**
     * The colours the list asks for, as the letters `WUBRG`
     * @type {string}
     * @memberof WatchListOverviewResponse
     */
    colors: string;
    /**
     * How many cards are on it
     * @type {number}
     * @memberof WatchListOverviewResponse
     */
    entries: number;
    /**
     * The list itself
     * @type {WatchListResponse}
     * @memberof WatchListOverviewResponse
     */
    list: WatchListResponse;
    /**
     * How many of those copies are still missing
     * 
     * Counted against the copies lying free in a collection only. A copy sleeved up in a deck is spoken for.
     * @type {number}
     * @memberof WatchListOverviewResponse
     */
    missing: number;
    /**
     * What the missing copies cost, in euro cents
     * @type {number}
     * @memberof WatchListOverviewResponse
     */
    price_eur_cents: number;
    /**
     * Wanted copies per rarity
     * @type {WatchedRaritiesResponse}
     * @memberof WatchListOverviewResponse
     */
    rarities: WatchedRaritiesResponse;
    /**
     * How many of those alarms the reader has not seen yet
     * @type {number}
     * @memberof WatchListOverviewResponse
     */
    unread: number;
    /**
     * How many copies they ask for between them
     * @type {number}
     * @memberof WatchListOverviewResponse
     */
    wanted: number;
}
/**
 * A list of cards an account is after
 * @export
 * @interface WatchListResponse
 */
export interface WatchListResponse {
    /**
     * The colour it is drawn in
     * @type {string}
     * @memberof WatchListResponse
     */
    color: string;
    /**
     * The point in time the list was created
     * @type {string}
     * @memberof WatchListResponse
     */
    created_at: string;
    /**
     * Description shown above the entries
     * @type {string}
     * @memberof WatchListResponse
     */
    description: string;
    /**
     * The pictogram drawn on it
     * @type {string}
     * @memberof WatchListResponse
     */
    icon: string;
    /**
     * What the list is called
     * @type {string}
     * @memberof WatchListResponse
     */
    name: string;
    /**
     * Primary key
     * @type {string}
     * @memberof WatchListResponse
     */
    uuid: string;
}
/**
 * What the catalog knows about a watched card
 * @export
 * @interface WatchedCardResponse
 */
export interface WatchedCardResponse {
    /**
     * Cardmarket's product id, `None` when Cardmarket does not stock it
     * 
     * Without one there is no price and therefore no alarm.
     * @type {number}
     * @memberof WatchedCardResponse
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     * @type {string}
     * @memberof WatchedCardResponse
     */
    collector_number: string;
    /**
     * Comma separated finishes this printing exists in
     * @type {string}
     * @memberof WatchedCardResponse
     */
    finishes: string;
    /**
     * Artwork for a closer look
     * @type {string}
     * @memberof WatchedCardResponse
     */
    image_normal?: string | null;
    /**
     * Artwork for a list row
     * @type {string}
     * @memberof WatchedCardResponse
     */
    image_small?: string | null;
    /**
     * Language of the printing, as Scryfall's code
     * @type {string}
     * @memberof WatchedCardResponse
     */
    lang: string;
    /**
     * The printed name
     * @type {string}
     * @memberof WatchedCardResponse
     */
    name: string;
    /**
     * Groups every printing of the same card
     * @type {string}
     * @memberof WatchedCardResponse
     */
    oracle_id?: string | null;
    /**
     * Market price in euro cents
     * @type {number}
     * @memberof WatchedCardResponse
     */
    price_eur_cents?: number | null;
    /**
     * Foil market price in euro cents
     * @type {number}
     * @memberof WatchedCardResponse
     */
    price_eur_foil_cents?: number | null;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof WatchedCardResponse
     */
    set_code: string;
    /**
     * Full set name
     * @type {string}
     * @memberof WatchedCardResponse
     */
    set_name: string;
    /**
     * When this printing last came out of a catalog sync
     * 
     * How old the prices on this row are: they do not move between syncs.
     * @type {string}
     * @memberof WatchedCardResponse
     */
    updated_at: string;
}
/**
 * One stack of a watched card, and where it lies
 * @export
 * @interface WatchedCopyResponse
 */
export interface WatchedCopyResponse {
    /**
     * The collection the stack lies in
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    collection: string;
    /**
     * Its marker colour
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    collection_color: string;
    /**
     * Its marker pictogram
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    collection_icon: string;
    /**
     * What that collection is called
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    collection_name: string;
    /**
     * Collector number as printed
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    collector_number?: string | null;
    /**
     * Condition of the cards
     * @type {CardCondition}
     * @memberof WatchedCopyResponse
     */
    condition: CardCondition;
    /**
     * The deck the collection stands for, `None` for a collection on a shelf
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    deck?: string | null;
    /**
     * What that deck is called
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    deck_name?: string | null;
    /**
     * Finish of the cards
     * @type {CardFinish}
     * @memberof WatchedCopyResponse
     */
    finish: CardFinish;
    /**
     * Artwork for a list row
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    image_small?: string | null;
    /**
     * Language of the printing, as Scryfall's code
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    lang?: string | null;
    /**
     * The printed name, `None` while the catalog misses the printing
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    name?: string | null;
    /**
     * Scryfall's id of the printing this stack holds
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    printing: string;
    /**
     * How many copies the stack holds
     * @type {number}
     * @memberof WatchedCopyResponse
     */
    quantity: number;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    set_code?: string | null;
    /**
     * Full set name
     * @type {string}
     * @memberof WatchedCopyResponse
     */
    set_name?: string | null;
}


/**
 * The printing an entry's price and alarm refer to
 * @export
 * @interface WatchedMarketResponse
 */
export interface WatchedMarketResponse {
    /**
     * Cardmarket's id of the product it is sold as, `None` when unstocked
     * @type {number}
     * @memberof WatchedMarketResponse
     */
    cardmarket_id?: number | null;
    /**
     * Collector number as printed
     * @type {string}
     * @memberof WatchedMarketResponse
     */
    collector_number: string;
    /**
     * Language of the printing, as Scryfall's code
     * @type {string}
     * @memberof WatchedMarketResponse
     */
    lang: string;
    /**
     * The printed name
     * @type {string}
     * @memberof WatchedMarketResponse
     */
    name: string;
    /**
     * What one copy of it costs, in euro cents
     * @type {number}
     * @memberof WatchedMarketResponse
     */
    price_cents: number;
    /**
     * Scryfall's id of the printing being priced
     * @type {string}
     * @memberof WatchedMarketResponse
     */
    printing: string;
    /**
     * Set code, upper case
     * @type {string}
     * @memberof WatchedMarketResponse
     */
    set_code: string;
}
/**
 * Wanted copies per rarity, for the bar under a tile
 * @export
 * @interface WatchedRaritiesResponse
 */
export interface WatchedRaritiesResponse {
    /**
     * Wanted copies of common cards
     * @type {number}
     * @memberof WatchedRaritiesResponse
     */
    common: number;
    /**
     * Wanted copies of mythic rare cards
     * @type {number}
     * @memberof WatchedRaritiesResponse
     */
    mythic: number;
    /**
     * Wanted copies of everything else the catalog files separately
     * @type {number}
     * @memberof WatchedRaritiesResponse
     */
    other: number;
    /**
     * Wanted copies of rare cards
     * @type {number}
     * @memberof WatchedRaritiesResponse
     */
    rare: number;
    /**
     * Wanted copies of uncommon cards
     * @type {number}
     * @memberof WatchedRaritiesResponse
     */
    uncommon: number;
}
/**
 * How many copies of a watched card the account already holds
 * @export
 * @interface WatchedStockResponse
 */
export interface WatchedStockResponse {
    /**
     * Copies lying in a collection that is not a deck's
     * @type {number}
     * @memberof WatchedStockResponse
     */
    free: number;
    /**
     * Free copies a looser finish match would count, including [`Self::free`]
     * @type {number}
     * @memberof WatchedStockResponse
     */
    free_any_finish: number;
    /**
     * Free copies a wider printing match would count
     * 
     * Includes [`Self::free`]; the difference is what the entry's printing switch is turning away.
     * @type {number}
     * @memberof WatchedStockResponse
     */
    free_any_printing: number;
    /**
     * Copies sleeved up in a deck
     * @type {number}
     * @memberof WatchedStockResponse
     */
    sleeved: number;
}
