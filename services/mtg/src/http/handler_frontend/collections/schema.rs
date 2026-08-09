use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::core::stuff::schema::SchemaDate;
use galvyn::core::stuff::schema::SchemaDateTime;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use uuid::Uuid;

use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::Collection;
use crate::models::collection::CollectionEntry;
use crate::models::collection::CollectionEntryUuid;
use crate::models::collection::CollectionUuid;
use crate::models::visibility::Visibility;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CollectionResponse {
    pub uuid: CollectionUuid,
    pub name: MaxStr<255>,
    pub description: MaxStr<1024>,
    pub visibility: Visibility,
    pub share_token: Option<MaxStr<64>>,
    pub created_at: SchemaDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateCollectionRequest {
    pub name: MaxStr<255>,
    pub description: MaxStr<1024>,
    pub visibility: Visibility,
}

/// Request to change who may see a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetCollectionVisibilityRequest {
    /// The visibility to switch to
    pub visibility: Visibility,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateCollectionRequest {
    pub name: MaxStr<255>,
    pub description: MaxStr<1024>,
}

/// The freshly minted secret of a collection's share link
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RotateShareTokenResponse {
    /// The new secret — every link handed out before this call stopped working
    pub share_token: MaxStr<64>,
}

/// One stack of identical cards in a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CollectionEntryResponse {
    /// Primary key
    pub uuid: CollectionEntryUuid,
    /// Scryfall's id of the printing — the client resolves name and image from it
    pub printing: Uuid,
    /// How many copies this stack holds
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// The day the cards were acquired
    pub acquired_at: Option<SchemaDate>,
    /// When the stack was filed
    pub created_at: SchemaDateTime,
}

/// The stacks in a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListCollectionEntriesResponse {
    /// One entry per stack
    pub entries: Vec<CollectionEntryResponse>,
}

/// A stack to file into a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct NewCollectionEntry {
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies to file
    pub quantity: i32,
    /// Condition of the cards
    pub condition: CardCondition,
    /// Finish of the cards
    pub finish: CardFinish,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// The day the cards were acquired
    pub acquired_at: Option<SchemaDate>,
}

/// Request to file stacks into a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AddCollectionEntriesRequest {
    /// The stacks to file
    pub entries: Vec<NewCollectionEntry>,
}

/// Request to change how many copies a stack holds
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SetEntryQuantityRequest {
    /// The new count
    pub quantity: i32,
}

impl From<CollectionEntry> for CollectionEntryResponse {
    fn from(entry: CollectionEntry) -> Self {
        Self {
            uuid: entry.uuid,
            printing: entry.printing,
            quantity: entry.quantity,
            condition: entry.condition,
            finish: entry.finish,
            purchase_price_cents: entry.purchase_price_cents,
            acquired_at: entry.acquired_at.map(SchemaDate),
            created_at: SchemaDateTime(entry.created_at),
        }
    }
}

impl From<Collection> for CollectionResponse {
    fn from(collection: Collection) -> Self {
        Self {
            uuid: collection.uuid,
            name: collection.name,
            visibility: collection.visibility,
            share_token: collection.share_token,
            description: collection.description,
            created_at: SchemaDateTime(collection.created_at),
        }
    }
}
