//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::deck::DeckZone;
use crate::models::deck::advisor::DeckTargets;
use crate::models::deck::advisor::MarkedCard;
use crate::models::deck::advisor::ThemePrefs;
use crate::models::deck::folder::DeckFolderKind;
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
    ///
    /// Indexed for the same reason as a collection's owner: the deck list and
    /// its summary both filter on it, and a foreign key carries no index of its
    /// own.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
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

    /// Whether the table agreed to more commanders than the format allows
    ///
    /// Rule 0 is an agreement, not a rule change: the command zone always took
    /// as many cards as it was given, and this only says the table signed off
    /// on it, so the deck stops being remarked upon for it.
    #[rorm(default = false)]
    pub allow_extra_commanders: bool,

    /// Whether the table agreed to more copies of a card than the format allows
    ///
    /// Cards whose own text lets a deck run any number of them never needed
    /// this — they are legal, not agreed.
    #[rorm(default = false)]
    pub allow_duplicates: bool,

    /// Whether the table agreed to cards the format bans
    ///
    /// The banlist itself is untouched, and the catalog keeps marking those
    /// cards; the deck simply stops complaining about the ones it was allowed.
    #[rorm(default = false)]
    pub allow_banned: bool,

    /// How many cards the deck is built to, `None` for the format's rule
    ///
    /// The commanders count toward it, the way [`DeckSize`] counts them, so a
    /// hundred here means the same hundred Commander asks for.
    ///
    /// [`DeckSize`]: crate::models::format::DeckSize
    pub deck_size: Option<i16>,

    /// The folder the deck is filed in, `None` while it is on no shelf
    ///
    /// A deck lies in at most one folder, which is what makes the list a set of
    /// sections rather than a deck repeated under every label it wears. The
    /// folder going away does not take the deck with it — it lands back among
    /// the unfiled ones.
    #[rorm(index, on_update = "Cascade", on_delete = "SetNull")]
    pub folder: Option<ForeignModel<DeckFolderModel>>,

    /// The point in time the deck was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// A shelf an account files its decks on
#[derive(Model, Debug)]
#[rorm(rename = "deck_folder")]
pub struct DeckFolderModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account whose folder this is
    ///
    /// Indexed for the same reason as a deck's owner: every read of the list
    /// filters on it, and a foreign key carries no index of its own.
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// What the folder is called
    pub name: MaxStr<64>,

    /// Which of the folders this is
    ///
    /// Everything an account invents is a [`DeckFolderKind::Custom`] one. The
    /// archive is the exception the app itself knows about, which is why it is
    /// a kind rather than a name: a name is the user's to change and to
    /// translate, and neither may decide whether a folder can be deleted.
    pub kind: DeckFolderKind,

    /// The point in time the folder was made
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`DeckFolderModel`]
#[derive(Patch)]
#[rorm(model = "DeckFolderModel")]
pub struct DeckFolderInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The account whose folder this is
    pub owner: ForeignModel<AccountModel>,
    /// What the folder is called
    pub name: MaxStr<64>,
    /// Which of the folders this is
    pub kind: DeckFolderKind,
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
    /// Whether the table agreed to more commanders than the format allows
    pub allow_extra_commanders: bool,
    /// Whether the table agreed to more copies of a card than the format allows
    pub allow_duplicates: bool,
    /// Whether the table agreed to cards the format bans
    pub allow_banned: bool,
    /// How many cards the deck is built to, commanders counted in
    pub deck_size: Option<i16>,
    /// The folder the deck is filed in
    pub folder: Option<ForeignModel<DeckFolderModel>>,
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

    /// Whether the copies in this slot are the foil ones
    ///
    /// Only ever what the owner said: whether a printing exists in foil at all
    /// is the catalog's business, and a foil-only printing reads as foil
    /// without this being set.
    #[rorm(default = false)]
    pub foil: bool,
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
    /// Whether the copies in this slot are the foil ones
    pub foil: bool,
}

/// An etiquette put on a deck's cards, e.g. "Ramp" or "Removal"
///
/// What a deck is grouped by besides card type. A tag belongs to an account;
/// `deck` decides whether assignments are local slots or global card identities.
#[derive(Model, Debug)]
#[rorm(rename = "deck_tag")]
pub struct DeckTagModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account whose tag this is
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// The deck the tag is local to, `None` for card-wide use on every deck
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub deck: Option<ForeignModel<DeckModel>>,

    /// What the tag is called
    pub name: MaxStr<64>,

    /// The colour it is drawn in, as one of the badge colours
    pub color: MaxStr<16>,

    /// The icon drawn inside its colour marker
    #[rorm(default = "tag")]
    pub icon: MaxStr<32>,

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
    /// The icon drawn inside its colour marker
    pub icon: MaxStr<32>,
}

/// A local tag put on one card slot of a deck
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

/// A global tag attached to a card through one of its printings
///
/// The printing is only the stable anchor. Reads resolve its current oracle id
/// or normalized name, so every artwork and language receives the tag.
#[derive(Model, Debug)]
#[rorm(rename = "global_card_tag")]
pub struct GlobalCardTagModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The global tag
    #[rorm(
        index(name = "global_card_tag", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub tag: ForeignModel<DeckTagModel>,

    /// One printing identifying the card
    #[rorm(index(name = "global_card_tag", priority = 2))]
    pub printing: Uuid,
}

/// Insert patch for [`GlobalCardTagModel`]
#[derive(Patch)]
#[rorm(model = "GlobalCardTagModel")]
pub struct GlobalCardTagInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The global tag
    pub tag: ForeignModel<DeckTagModel>,
    /// One printing identifying the card
    pub printing: Uuid,
}

/// One reader's advisor settings for one deck
#[derive(Model)]
pub struct DeckAdvisorSettingsModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The deck these settings are about
    ///
    /// Unique: the whole document is one row, replaced wholesale, and the
    /// deck going away takes it with it.
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub deck: ForeignModel<DeckModel>,

    /// Which themes to argue for and which to avoid
    pub themes: Json<ThemePrefs>,

    /// The shape the deck is graded against, where it was moved
    pub targets: Json<DeckTargets>,

    /// The restriction on what may be suggested at all, `None` for the whole pool
    pub pool_query: Option<MaxStr<512>>,

    /// Cards the advisor must never offer
    pub ignored: Json<Vec<MarkedCard>>,

    /// Cards the advisor must never propose cutting
    pub kept: Json<Vec<MarkedCard>>,

    /// Whether the reader has been through the advisor's questions
    #[rorm(default = false)]
    pub setup_done: bool,
}

/// Insert patch for [`DeckAdvisorSettingsModel`]
#[derive(Patch)]
#[rorm(model = "DeckAdvisorSettingsModel")]
pub struct DeckAdvisorSettingsInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The deck these settings are about
    pub deck: ForeignModel<DeckModel>,
    /// Which themes to argue for and which to avoid
    pub themes: Json<ThemePrefs>,
    /// The shape the deck is graded against, where it was moved
    pub targets: Json<DeckTargets>,
    /// The restriction on what may be suggested at all, `None` for the whole pool
    pub pool_query: Option<MaxStr<512>>,
    /// Cards the advisor must never offer
    pub ignored: Json<Vec<MarkedCard>>,
    /// Cards the advisor must never propose cutting
    pub kept: Json<Vec<MarkedCard>>,
    /// Whether the reader has been through the advisor's questions
    pub setup_done: bool,
}
