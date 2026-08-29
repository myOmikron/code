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
use crate::models::deck::db::DeckModel;
use crate::models::visibility::Visibility;

/// A group of cards owned by an account
///
/// Doubles as the physical container: a collection *is* the collection, the binder or
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

    /// The colour the collection is drawn in
    #[rorm(default = "zinc")]
    pub color: MaxStr<16>,

    /// The pictogram drawn on the collection
    #[rorm(default = "box")]
    pub icon: MaxStr<32>,

    /// The deck this collection stands for, `None` for a collection on a shelf
    ///
    /// A deck can keep the cards that are physically in it as a collection of
    /// its own. Unique, so a deck has at most one; cascading, so deleting the
    /// deck takes the collection with it.
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub deck: Option<ForeignModel<DeckModel>>,

    /// The owner of the collection
    ///
    /// Indexed: every page that lists collections, and the summary behind the
    /// overview, filter on it. Postgres does not index a foreign key on its own,
    /// so without this each of those reads walks every account's collections.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
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
    /// The colour the collection is drawn in
    pub color: MaxStr<16>,
    /// The pictogram drawn on the collection
    pub icon: MaxStr<32>,
    /// The deck this collection stands for
    pub deck: Option<ForeignModel<DeckModel>>,
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
/// are interchangeable. The same card lying in two different collections is one row
/// per collection, because each collection is its own collection.
#[derive(Model, Debug)]
#[rorm(rename = "collection_entry")]
pub struct CollectionEntryModel {
    /// Primary key
    ///
    /// The second half of the `collection_uuid` index — see `collection`.
    /// A *named* index may span the primary key; an unnamed one may not,
    /// because that would only duplicate the key's own index.
    #[rorm(primary_key, index(name = "collection_uuid", priority = 2))]
    pub uuid: Uuid,

    /// The collection this entry belongs to
    ///
    /// Listing a collection filters on this and orders by `uuid`, and Postgres
    /// does not index a foreign key column on its own. As a composite in that
    /// order one index answers both, so the read becomes a range scan instead
    /// of walking the primary key over every account's entries and discarding
    /// what does not match.
    #[rorm(
        index(name = "collection_uuid", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub collection: ForeignModel<CollectionModel>,

    /// Scryfall's id of the printing
    ///
    /// Not a foreign key: the card catalog is shipped to the client, the
    /// backend has no printing table. Scryfall occasionally merges printings
    /// (`/migrations`), which is repaired by rewriting this column.
    ///
    /// The language is part of the printing — Scryfall gives every language
    /// its own id — so there is no separate language column.
    ///
    /// Indexed for [`super::CollectionEntry::apply_printing_merge`], which
    /// searches by it across every collection.
    #[rorm(index)]
    pub printing: Uuid,

    /// How many copies this stack holds
    pub quantity: i32,

    /// Condition of the cards in this stack
    pub condition: CardCondition,

    /// Finish of the cards in this stack
    pub finish: CardFinish,

    /// Whether the cards carry an artist's signature
    ///
    /// Part of what makes a stack interchangeable, like the condition and the
    /// finish: a signed card is not the card next to it, whatever a price
    /// guide says. Cardmarket sells it as its own listing for the same reason.
    #[rorm(default = false)]
    pub signed: bool,

    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,

    /// The day the cards were acquired
    pub acquired_at: Option<Date>,

    /// The collection the cards were taken out of, `None` if they were always here
    ///
    /// Only ever set on a deck's collection, where it is what makes taking the
    /// deck apart again possible. `SetNull` rather than a cascade: losing the
    /// collection a card came from must not lose the card.
    ///
    /// Indexed because it is read the other way round as well: what a collection
    /// has lent out is a search for its own id in this column, across every
    /// entry there is.
    #[rorm(index, on_update = "Cascade", on_delete = "SetNull")]
    pub origin: Option<ForeignModel<CollectionModel>>,

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
    /// Whether the cards carry an artist's signature
    pub signed: bool,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// The day the cards were acquired
    pub acquired_at: Option<Date>,
    /// The collection the cards were taken out of
    pub origin: Option<ForeignModel<CollectionModel>>,
}
