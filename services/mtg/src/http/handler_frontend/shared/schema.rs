use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::collections::schema::CollectionStatisticsResponse;
use crate::http::handler_frontend::collections::schema::ListedCardResponse;
use crate::http::handler_frontend::collections::schema::ListedEntryResponse;

/// A collection as the holder of its share link sees it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SharedCollectionResponse {
    /// Name of the collection
    pub name: MaxStr<255>,
    /// Description shown above the card list
    pub description: MaxStr<1024>,
    /// Display name of the account the collection belongs to
    pub owner: String,
    /// The point in time the collection was created
    pub created_at: SchemaDateTime,
}

/// A deck as the holder of its share link sees it
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SharedDeckResponse {
    /// Name of the deck
    pub name: MaxStr<255>,
    /// Optional description, e.g. the deck's game plan
    pub description: Option<MaxStr<1024>>,
    /// The format the deck is built for
    pub format: MaxStr<32>,
    /// The colours the deck may play, `null` for whatever the commander allows
    pub allowed_color_identity: Option<MaxStr<8>>,
    /// Display name of the account the deck belongs to
    pub owner: String,
    /// The point in time the deck was created
    pub created_at: SchemaDateTime,
}

/// Take what somebody else's collection is not meant to reveal out of a stack
///
/// Money first: neither what was paid nor what the cards fetch today. A price
/// per card reads as a catalog figure, but a collection is a list of cards
/// somebody owns, and a listing that prices every row of it prices the shelf —
/// which is a thing about its owner, not about the cards. The tags go for the
/// same reason: they say how the owner sorts, not what the card is.
///
/// What is left is the cards themselves, which is what a reader came for.
pub fn redact_entry(entry: ListedEntryResponse) -> ListedEntryResponse {
    ListedEntryResponse {
        purchase_price_cents: None,
        tags: Vec::new(),
        card: entry.card.map(|card| ListedCardResponse {
            price_eur_cents: None,
            price_eur_foil_cents: None,
            ..card
        }),
        ..entry
    }
}

/// Take every figure in money out of a collection's statistics, see [`redact_entry`]
///
/// The counts stay: how the collection is spread over colours, types, rarities
/// and years says what kind of collection it is without saying what it is worth.
pub fn redact_statistics(mut stats: CollectionStatisticsResponse) -> CollectionStatisticsResponse {
    // The timeline is two series sharing a month, and only one of them is
    // money — emptying it would take the copy count with it.
    for point in &mut stats.timeline {
        point.value_cents = 0;
    }

    CollectionStatisticsResponse {
        market_value_cents: 0,
        priced_cards: 0,
        purchase_total_cents: 0,
        purchased_cards: 0,
        market_of_purchased_cents: 0,
        average_value_cents: 0,
        reserved_value_cents: 0,
        value_buckets: Vec::new(),
        top_cards: Vec::new(),
        price_points: Vec::new(),
        ..stats
    }
}
