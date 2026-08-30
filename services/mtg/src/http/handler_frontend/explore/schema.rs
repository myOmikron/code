use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::collections::schema::RarityCountsResponse;
use crate::http::handler_frontend::decks::schema::DeckCommanderResponse;
use crate::models::collection::CollectionUuid;
use crate::models::collection::listing::CollectionSummary;
use crate::models::deck::DeckUuid;
use crate::models::deck::discovery::PublicDeck;
use crate::models::deck::discovery::PublicDeckSort;

/// What a reader is looking for among the public decks
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct SearchPublicDecksQuery {
    /// Part of the deck's name or of a commander's
    pub search: Option<String>,
    /// The format slug, e.g. `commander`
    pub format: Option<String>,
    /// The username of the account that built it
    pub owner: Option<String>,
    /// Only decks claiming this Commander bracket, one to five
    pub bracket: Option<i16>,
    /// What the page is ordered by
    #[serde(default)]
    pub sort: PublicDeckSort,
    /// Whether the order is reversed
    #[serde(default)]
    pub descending: bool,
    /// How many decks the page holds
    #[serde(default = "default_limit")]
    pub limit: u32,
    /// How many decks to skip
    #[serde(default)]
    pub offset: u32,
}

/// How many decks a page holds when the request does not say
fn default_limit() -> u32 {
    24
}

/// A deck somebody put on show
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PublicDeckResponse {
    /// Primary key
    pub uuid: DeckUuid,
    /// Name of the deck
    pub name: String,
    /// Optional description, e.g. the deck's game plan
    pub description: Option<String>,
    /// The format it is built for
    pub format: String,
    /// The colours it may play, `null` for whatever the commander allows
    pub allowed_color_identity: Option<String>,
    /// Which Commander bracket the deck is built to, `null` when it claims none
    pub bracket: Option<i16>,
    /// The username of the account that built it, `null` once it is deleted
    ///
    /// The decklist stays; who built it does not.
    pub owner: Option<String>,
    /// How many cards sit in the deck proper, the sideboard aside
    pub cards: i64,
    /// What those cards are worth in euro cents
    pub price_eur_cents: i64,
    /// The commanders, in the order they were put in
    pub commanders: Vec<DeckCommanderResponse>,
    /// The point in time the deck was created
    pub created_at: SchemaDateTime,
}

/// One page of the decks their owners put on show
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SearchPublicDecksResponse {
    /// The decks on this page
    pub decks: Vec<PublicDeckResponse>,
    /// How many decks the search found in total
    pub total: i64,
    /// How many decks were asked for
    pub limit: u32,
    /// How many decks were skipped
    pub offset: u32,
}

/// A collection somebody put on show
///
/// What a collection looks like to a stranger: no share token, and no figure in
/// money — see [`redact_entry`] for the same line drawn on its cards.
///
/// [`redact_entry`]: crate::http::handler_frontend::shared::schema::redact_entry
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PublicCollectionResponse {
    /// Primary key
    pub uuid: CollectionUuid,
    /// Name of the collection
    pub name: String,
    /// Description shown above the card list
    pub description: String,
    /// The colour the collection is drawn in
    pub color: String,
    /// The pictogram drawn on the collection
    pub icon: String,
    /// The username of the account it belongs to
    pub owner: String,
    /// How many copies are filed in it
    pub cards: i64,
    /// Copies per rarity
    pub rarities: RarityCountsResponse,
    /// The colours the collection holds, as the letters `WUBRG`
    pub colors: String,
    /// Artwork of the most valuable cards in it, at most two
    pub arts: Vec<String>,
    /// The point in time the collection was created
    pub created_at: SchemaDateTime,
}

/// An account, as far as strangers get to see it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PublicProfileResponse {
    /// The account's login handle and display name
    pub username: String,
    /// The point in time the account was created
    pub created_at: SchemaDateTime,
    /// The decks it put on show, newest first
    pub decks: Vec<PublicDeckResponse>,
    /// The collections it put on show, alphabetically
    pub collections: Vec<PublicCollectionResponse>,
}

impl From<PublicDeck> for PublicDeckResponse {
    fn from(deck: PublicDeck) -> Self {
        Self {
            uuid: deck.uuid,
            name: deck.name,
            description: deck.description,
            format: deck.format,
            allowed_color_identity: deck.allowed_color_identity,
            bracket: deck.bracket,
            owner: deck.owner,
            cards: deck.cards,
            price_eur_cents: deck.price_eur,
            commanders: deck
                .commanders
                .into_iter()
                .map(DeckCommanderResponse::from)
                .collect(),
            created_at: SchemaDateTime(deck.created_at),
        }
    }
}

impl PublicCollectionResponse {
    /// Pairs a public collection with what was counted in it
    ///
    /// A collection nobody has filed anything into has no row in the summary,
    /// which reads as the zeroes it is.
    pub fn new(
        collection: crate::models::collection::Collection,
        owner: String,
        summary: Option<CollectionSummary>,
    ) -> Self {
        let summary = summary.unwrap_or_default();
        Self {
            uuid: collection.uuid,
            name: collection.name.into_inner(),
            description: collection.description.into_inner(),
            color: collection.color.into_inner(),
            icon: collection.icon.into_inner(),
            owner,
            cards: summary.cards,
            rarities: RarityCountsResponse {
                common: summary.rarities.common,
                uncommon: summary.rarities.uncommon,
                rare: summary.rarities.rare,
                mythic: summary.rarities.mythic,
                other: summary.rarities.other,
            },
            colors: summary.colors,
            arts: summary.arts,
            created_at: SchemaDateTime(collection.created_at),
        }
    }
}
