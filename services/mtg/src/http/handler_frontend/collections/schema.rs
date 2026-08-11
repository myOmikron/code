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
use crate::models::card_attributes::CardRarity;
use crate::models::collection::Collection;
use crate::models::collection::CollectionEntry;
use crate::models::collection::CollectionEntryUuid;
use crate::models::collection::CollectionUuid;
use crate::models::collection::listing::EntrySort;
use crate::models::collection::listing::ListedCard;
use crate::models::collection::listing::ListedEntry;
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

/// Request to change some of a stack's fields
///
/// Every field is optional and an omitted one is left alone. The two nullable
/// ones are wrapped twice so that `null` can mean "clear this": with a single
/// `Option` a cleared price and an untouched one arrive as the same value.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct UpdateCollectionEntryRequest {
    /// Scryfall's id of the printing — send this to correct a mis-identified card
    #[serde(default)]
    pub printing: Option<Uuid>,
    /// The new count
    #[serde(default)]
    pub quantity: Option<i32>,
    /// The condition the cards are in
    #[serde(default)]
    pub condition: Option<CardCondition>,
    /// The finish the cards have
    #[serde(default)]
    pub finish: Option<CardFinish>,
    /// What was paid per copy, in euro cents; `null` clears it
    #[serde(default, deserialize_with = "double_option")]
    pub purchase_price_cents: Option<Option<i64>>,
    /// The day the cards were acquired; `null` clears it
    #[serde(default, deserialize_with = "double_option")]
    pub acquired_at: Option<Option<SchemaDate>>,
}

/// Request to move copies out of a stack into a new one
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SplitCollectionEntryRequest {
    /// How many copies move out — fewer than the stack holds
    pub quantity: i32,
    /// The condition of the split-off cards; inherited when omitted
    #[serde(default)]
    pub condition: Option<CardCondition>,
    /// The finish of the split-off cards; inherited when omitted
    #[serde(default)]
    pub finish: Option<CardFinish>,
    /// What was paid per copy, in euro cents; inherited when omitted, `null` clears it
    #[serde(default, deserialize_with = "double_option")]
    pub purchase_price_cents: Option<Option<i64>>,
    /// The day the split-off cards were acquired; inherited when omitted, `null` clears it
    #[serde(default, deserialize_with = "double_option")]
    pub acquired_at: Option<Option<SchemaDate>>,
}

/// The two stacks a split leaves behind
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SplitCollectionEntryResponse {
    /// The original stack, now holding the copies that stayed
    pub source: CollectionEntryResponse,
    /// The stack the copies moved into
    pub created: CollectionEntryResponse,
}

/// Request to combine stacks of the same cards into one
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MergeCollectionEntriesRequest {
    /// The stacks to combine — at least two, all of the same printing,
    /// condition and finish
    pub entries: Vec<CollectionEntryUuid>,
}

/// Distinguishes an omitted field from one explicitly set to `null`
///
/// Serde reads `null` into an `Option<Option<T>>` as the outer `None`, which is
/// the same thing an absent field produces — exactly the distinction a partial
/// update needs. Deserializing the inner `Option` and wrapping it keeps them
/// apart: absent stays `None`, `null` becomes `Some(None)`.
fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
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

/// How to page, sort and filter a collection's cards
///
/// Every field has a default, so the bare endpoint answers with the first page
/// in the order the stacks were filed — the behaviour the unpaged list had.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListCardsQuery {
    /// How many stacks to return, capped server-side
    #[serde(default = "default_limit")]
    pub limit: u32,
    /// How many stacks to skip, ignored when `after` is given
    #[serde(default)]
    pub offset: u32,
    /// Continue after this stack instead of counting rows off the front
    ///
    /// The cheap way to page: the stack ids are time-ordered, so resuming from
    /// one is an indexed range scan whose cost does not grow with how far into
    /// the collection the page sits. Only applies to the filed order — take the
    /// value from a previous response's `next_cursor`.
    #[serde(default)]
    pub after: Option<CollectionEntryUuid>,
    /// What to order by
    #[serde(default)]
    pub sort: EntrySort,
    /// Whether to reverse that order
    #[serde(default)]
    pub descending: bool,
    /// Free text matched against the card name, accents and case folded
    #[serde(default)]
    pub search: Option<String>,
    /// Only stacks in this condition
    #[serde(default)]
    pub condition: Option<CardCondition>,
    /// Only stacks with this finish
    #[serde(default)]
    pub finish: Option<CardFinish>,
    /// Only cards of this rarity
    #[serde(default)]
    pub rarity: Option<CardRarity>,
    /// Only stacks of this printing
    #[serde(default)]
    pub printing: Option<Uuid>,
}

/// The page size a client gets without asking for one
fn default_limit() -> u32 {
    60
}

/// What the catalog knows about a listed stack's card
///
/// `None` on an entry means the catalog has not caught up with that printing —
/// a card filed from a set released since the last sync. The row still lists.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListedCardResponse {
    /// The printed name
    pub name: String,
    /// Set code, upper case
    pub set_code: String,
    /// Full set name
    pub set_name: String,
    /// Collector number as printed
    pub collector_number: String,
    /// How rare the printing is
    pub rarity: CardRarity,
    /// Mana value
    pub mana_value: f64,
    /// Colour identity as the letters `WUBRG`
    pub color_identity: String,
    /// Type line as printed
    pub type_line: String,
    /// Artwork for a list row
    pub image_small: Option<String>,
    /// Artwork for a closer look — what a hover preview shows
    pub image_normal: Option<String>,
    /// Market price in euro cents
    pub price_eur_cents: Option<i64>,
    /// Foil market price in euro cents
    pub price_eur_foil_cents: Option<i64>,
    /// The finishes this printing exists in, as Scryfall spells them
    pub finishes: Vec<String>,
    /// Whether the card is on the reserved list
    pub reserved: bool,
}

/// One stack, with the card it holds
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListedEntryResponse {
    /// Primary key
    pub uuid: CollectionEntryUuid,
    /// Scryfall's id of the printing
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
    /// The card, as far as the catalog knows it
    pub card: Option<ListedCardResponse>,
}

/// One page of a collection
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListCardsResponse {
    /// The stacks on this page
    pub entries: Vec<ListedEntryResponse>,
    /// How many stacks match the filters in total, for the pager
    pub total: i64,
    /// The page size actually applied, which may be below what was asked for
    pub limit: u32,
    /// How many stacks were skipped
    pub offset: u32,
    /// Pass back as `after` to get the next page, `None` at the end
    pub next_cursor: Option<CollectionEntryUuid>,
}

impl From<ListedCard> for ListedCardResponse {
    fn from(card: ListedCard) -> Self {
        Self {
            name: card.name,
            set_code: card.set_code,
            set_name: card.set_name,
            collector_number: card.collector_number,
            rarity: card.rarity,
            mana_value: card.mana_value,
            color_identity: card.color_identity,
            type_line: card.type_line,
            image_small: card.image_small,
            image_normal: card.image_normal,
            price_eur_cents: card.price_eur,
            price_eur_foil_cents: card.price_eur_foil,
            // Stored joined by commas, because a list of at most three fixed
            // words does not earn a table of its own.
            finishes: card
                .finishes
                .split(',')
                .filter(|finish| !finish.is_empty())
                .map(str::to_owned)
                .collect(),
            reserved: card.reserved,
        }
    }
}

impl From<ListedEntry> for ListedEntryResponse {
    fn from(entry: ListedEntry) -> Self {
        Self {
            uuid: entry.uuid,
            printing: entry.printing,
            quantity: entry.quantity,
            condition: entry.condition,
            finish: entry.finish,
            purchase_price_cents: entry.purchase_price_cents,
            acquired_at: entry.acquired_at.map(SchemaDate),
            created_at: SchemaDateTime(entry.created_at),
            card: entry.card.map(ListedCardResponse::from),
        }
    }
}
