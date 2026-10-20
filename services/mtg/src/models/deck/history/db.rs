//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use uuid::Uuid;

use crate::models::deck::db::DeckModel;
use crate::models::deck::history::DeckChangeKind;
use crate::models::deck::history::DeckDifference;

/// One Deck change of a deck's Deck history
///
/// Holds only its difference; a state of the deck is computed backwards from
/// the current one.
#[derive(Model, Debug)]
#[rorm(rename = "deck_change")]
pub struct DeckChangeModel {
    /// Primary key
    ///
    /// A v7 uuid, so ordering by it is the order of the Deck history. The
    /// second half of the `deck_change_deck` index, see [`Self::deck`].
    #[rorm(primary_key, index(name = "deck_change_deck", priority = 2))]
    pub uuid: Uuid,

    /// The deck whose Deck history this belongs to
    ///
    /// Indexed together with [`Self::uuid`], so a deck's Deck history pages
    /// newest first without reading any other deck's.
    #[rorm(
        index(name = "deck_change_deck", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub deck: ForeignModel<DeckModel>,

    /// When the Deck change happened
    pub changed_at: OffsetDateTime,

    /// What the owner did, for telling it apart in the Deck history
    pub kind: DeckChangeKind,

    /// What the Deck change did to the deck
    pub difference: Json<DeckDifference>,
}

/// Insert patch for [`DeckChangeModel`]
#[derive(Patch)]
#[rorm(model = "DeckChangeModel")]
pub struct DeckChangeInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The deck whose Deck history this belongs to
    pub deck: ForeignModel<DeckModel>,
    /// When the Deck change happened
    pub changed_at: OffsetDateTime,
    /// What the owner did
    pub kind: DeckChangeKind,
    /// What the Deck change did to the deck
    pub difference: Json<DeckDifference>,
}
