//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::deck::DeckZone;
use crate::models::visibility::Visibility;

/// A deck built for a specific format
#[derive(Model, Debug)]
#[rorm(rename = "deck")]
pub struct DeckModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// Name of the deck
    pub name: MaxStr<255>,

    /// Optional description, e.g. the deck's game plan
    pub description: Option<MaxStr<1024>>,

    /// The owner of the deck
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// The format this deck is built for
    ///
    /// A free-form slug rather than an enum, matching the keys of Scryfall's
    /// `legalities` object. The backend never interprets it: legality depends
    /// on the current banlist, which lives in the card catalog on the client,
    /// and formats keep being added.
    pub format: MaxStr<32>,

    /// Who may see this deck
    pub visibility: Visibility,

    /// Secret of the share link, `None` once the link is revoked
    #[rorm(unique)]
    pub share_token: Option<MaxStr<64>>,

    /// Which Commander bracket the deck is built to, `None` when unset
    ///
    /// One to five, from Exhibition to cEDH. Only the Game Changer count of a
    /// bracket can be checked against the catalog; the rest of what a bracket
    /// asks for is a judgement its builder makes.
    pub bracket: Option<i16>,

    /// The colours the deck may play, as the letters `WUBRG`
    ///
    /// `None` means "whatever the commander allows", which is what the client
    /// derives from the commander zone. Set it to overrule that: there are
    /// commanders that grant the deck a colour outside their own identity, and
    /// more of them keep being printed, so the check cannot treat Scryfall's
    /// `color_identity` as the last word.
    pub allowed_color_identity: Option<MaxStr<8>>,

    /// The point in time the deck was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`DeckModel`]
#[derive(Patch)]
#[rorm(model = "DeckModel")]
pub struct DeckInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Name of the deck
    pub name: MaxStr<255>,
    /// Optional description
    pub description: Option<MaxStr<1024>>,
    /// The owner of the deck
    pub owner: ForeignModel<AccountModel>,
    /// The format this deck is built for
    pub format: MaxStr<32>,
    /// Who may see this deck
    pub visibility: Visibility,
    /// Secret of the share link
    pub share_token: Option<MaxStr<64>>,
    /// The colours the deck may play
    pub allowed_color_identity: Option<MaxStr<8>>,
    /// Which Commander bracket the deck is built to
    pub bracket: Option<i16>,
}

/// One card slot of a [`DeckModel`]
#[derive(Model, Debug)]
#[rorm(rename = "deckcard")]
pub struct DeckCardModel {
    /// Primary key
    ///
    /// The second half of the `deck_uuid` index — see `deck`.
    #[rorm(primary_key, index(name = "deck_uuid", priority = 2))]
    pub uuid: Uuid,

    /// The deck this card belongs to
    ///
    /// Reading a deck filters on this and orders by `uuid`, and Postgres does
    /// not index a foreign key column on its own.
    #[rorm(
        index(name = "deck_uuid", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub deck: ForeignModel<DeckModel>,

    /// Scryfall's id of the printing
    ///
    /// The printing decides which physical card is sleeved; legality and the
    /// copy limit are counted per oracle card, which the client resolves from
    /// the catalog. Card *faces* are not valid here — a modal double-faced
    /// card is one deck card, not two.
    #[rorm(index)]
    pub printing: Uuid,

    /// How many copies of this card the zone holds
    pub quantity: i32,

    /// Which zone the card sits in
    ///
    /// A column rather than separate tables, so commanders, companions and
    /// sideboards need no schema change — Partner decks simply have two rows
    /// in [`DeckZone::Commander`].
    pub zone: DeckZone,
}

/// Insert patch for [`DeckCardModel`]
#[derive(Patch)]
#[rorm(model = "DeckCardModel")]
pub struct DeckCardInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The deck this card belongs to
    pub deck: ForeignModel<DeckModel>,
    /// Scryfall's id of the printing
    pub printing: Uuid,
    /// How many copies of this card the zone holds
    pub quantity: i32,
    /// Which zone the card sits in
    pub zone: DeckZone,
}

/// An etiquette put on a deck's cards, e.g. "Ramp" or "Removal"
///
/// What a deck is grouped by besides card type. A tag belongs to an account;
/// `deck` decides whether it is offered on one deck or on all of them.
#[derive(Model, Debug)]
#[rorm(rename = "deck_tag")]
pub struct DeckTagModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account whose tag this is
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// The deck the tag is local to, `None` for one offered on every deck
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub deck: Option<ForeignModel<DeckModel>>,

    /// What the tag is called
    pub name: MaxStr<64>,

    /// The colour it is drawn in, as one of the badge colours
    pub color: MaxStr<16>,

    /// The point in time the tag was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`DeckTagModel`]
#[derive(Patch)]
#[rorm(model = "DeckTagModel")]
pub struct DeckTagInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The account whose tag this is
    pub owner: ForeignModel<AccountModel>,
    /// The deck the tag is local to
    pub deck: Option<ForeignModel<DeckModel>>,
    /// What the tag is called
    pub name: MaxStr<64>,
    /// The colour it is drawn in
    pub color: MaxStr<16>,
}

/// A tag put on one card of a deck
#[derive(Model, Debug)]
#[rorm(rename = "deck_card_tag")]
pub struct DeckCardTagModel {
    /// Primary key
    ///
    /// The second half of the `deck_card_tag` index — see `deck_card`.
    #[rorm(primary_key, index(name = "deck_card_tag", priority = 2))]
    pub uuid: Uuid,

    /// The card slot the tag sits on
    #[rorm(
        index(name = "deck_card_tag", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub deck_card: ForeignModel<DeckCardModel>,

    /// The tag
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub tag: ForeignModel<DeckTagModel>,
}

/// Insert patch for [`DeckCardTagModel`]
#[derive(Patch)]
#[rorm(model = "DeckCardTagModel")]
pub struct DeckCardTagInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The card slot the tag sits on
    pub deck_card: ForeignModel<DeckCardModel>,
    /// The tag
    pub tag: ForeignModel<DeckTagModel>,
}
