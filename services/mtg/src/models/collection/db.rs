//! Database models backing [`super`]

use galvyn::core::re_exports::time::Date;
use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::card_attributes::CardCondition;
use crate::models::card_attributes::CardFinish;
use crate::models::visibility::Visibility;

/// A group of cards owned by an account
///
/// Doubles as the physical container: a collection *is* the box, the binder or
/// the shelf, so an entry needs no separate location.
#[derive(Model, Debug)]
#[rorm(rename = "collection")]
pub struct CollectionModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// Name of the collection
    pub name: MaxStr<255>,

    /// Description shown above the card list
    pub description: MaxStr<1024>,

    /// The owner of the collection
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// Who may see this collection
    pub visibility: Visibility,

    /// Secret of the share link, `None` once the link is revoked
    ///
    /// Deliberately not the primary key: rotating this is how a shared link is
    /// withdrawn, which would otherwise mean changing the key every row points at.
    #[rorm(unique)]
    pub share_token: Option<MaxStr<64>>,

    /// The point in time the collection was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`CollectionModel`]
#[derive(Patch)]
#[rorm(model = "CollectionModel")]
pub struct CollectionInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Name of the collection
    pub name: MaxStr<255>,
    /// Description
    pub description: MaxStr<1024>,
    /// The owner of the collection
    pub owner: ForeignModel<AccountModel>,
    /// Who may see this collection
    pub visibility: Visibility,
    /// Secret of the share link
    pub share_token: Option<MaxStr<64>>,
}

/// A stack of identical physical cards inside a [`CollectionModel`]
///
/// One row per (printing, condition, finish) — the stack only holds cards that
/// are interchangeable. The same card lying in two different boxes is one row
/// per box, because each box is its own collection.
#[derive(Model, Debug)]
#[rorm(rename = "collection_entry")]
pub struct CollectionEntryModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The collection this entry belongs to
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub collection: ForeignModel<CollectionModel>,

    /// Scryfall's id of the printing
    ///
    /// Not a foreign key: the card catalog is shipped to the client, the
    /// backend has no printing table. Scryfall occasionally merges printings
    /// (`/migrations`), which is repaired by rewriting this column.
    ///
    /// The language is part of the printing — Scryfall gives every language
    /// its own id — so there is no separate language column.
    #[rorm(index)]
    pub printing: Uuid,

    /// How many copies this stack holds
    pub quantity: i32,

    /// Condition of the cards in this stack
    pub condition: CardCondition,

    /// Finish of the cards in this stack
    pub finish: CardFinish,

    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,

    /// The day the cards were acquired
    pub acquired_at: Option<Date>,

    /// The point in time the entry was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`CollectionEntryModel`]
#[derive(Patch)]
#[rorm(model = "CollectionEntryModel")]
pub struct CollectionEntryInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The collection this entry belongs to
    pub collection: ForeignModel<CollectionModel>,
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
    pub acquired_at: Option<Date>,
}
