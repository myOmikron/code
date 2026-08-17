use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::http::handler_frontend::collections::schema::CollectionStatisticsResponse;
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

/// Take what a share link is not meant to reveal out of a listed stack
///
/// What somebody paid for their cards stays theirs.
pub fn redact_entry(entry: ListedEntryResponse) -> ListedEntryResponse {
    ListedEntryResponse {
        purchase_price_cents: None,
        ..entry
    }
}

/// Take the purchase figures out of a collection's statistics, see [`redact_entry`]
pub fn redact_statistics(stats: CollectionStatisticsResponse) -> CollectionStatisticsResponse {
    CollectionStatisticsResponse {
        purchase_total_cents: 0,
        purchased_cards: 0,
        market_of_purchased_cents: 0,
        price_points: Vec::new(),
        ..stats
    }
}
