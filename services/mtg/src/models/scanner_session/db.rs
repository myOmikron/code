//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::card_attributes::CardFinish;
use crate::models::collection::db::CollectionModel;

/// A persisted staging area shared by scanners and desktop clients
#[derive(Model, Debug)]
#[rorm(rename = "scanner_session")]
pub struct ScannerSessionModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,
    /// Name shown in the session picker
    pub name: MaxStr<255>,
    /// Colour used by its marker
    #[rorm(default = "lime")]
    pub color: MaxStr<16>,
    /// Pictogram used by its marker
    #[rorm(default = "camera")]
    pub icon: MaxStr<32>,
    /// Collection offered first when this session is filed
    #[rorm(on_update = "Cascade", on_delete = "SetNull")]
    pub collection: Option<ForeignModel<CollectionModel>>,
    /// Account that owns the session
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,
    /// When the session was created
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`ScannerSessionModel`]
#[derive(Patch)]
#[rorm(model = "ScannerSessionModel")]
pub struct ScannerSessionInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Display name
    pub name: MaxStr<255>,
    /// Marker colour
    pub color: MaxStr<16>,
    /// Marker icon
    pub icon: MaxStr<32>,
    /// Preferred collection
    pub collection: Option<ForeignModel<CollectionModel>>,
    /// Owner
    pub owner: ForeignModel<AccountModel>,
}

/// One editable stack in a scanner session
#[derive(Model, Debug)]
#[rorm(rename = "scanner_session_entry")]
pub struct ScannerSessionEntryModel {
    /// Primary key, ordered after the session for efficient listing
    #[rorm(primary_key, index(name = "scanner_session_uuid", priority = 2))]
    pub uuid: Uuid,
    /// Session that owns the staged stack
    #[rorm(
        index(name = "scanner_session_uuid", priority = 1),
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    pub scanner_session: ForeignModel<ScannerSessionModel>,
    /// Scryfall printing id
    #[rorm(index)]
    pub printing: Uuid,
    /// Number of staged copies
    pub quantity: i32,
    /// Physical finish
    pub finish: CardFinish,
    /// Whether the cards are signed
    #[rorm(default = false)]
    pub signed: bool,
    /// What was paid per copy, in euro cents
    pub purchase_price_cents: Option<i64>,
    /// When this stack first entered the staging area
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`ScannerSessionEntryModel`]
#[derive(Patch)]
#[rorm(model = "ScannerSessionEntryModel")]
pub struct ScannerSessionEntryInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Parent session
    pub scanner_session: ForeignModel<ScannerSessionModel>,
    /// Printing
    pub printing: Uuid,
    /// Number of copies
    pub quantity: i32,
    /// Finish
    pub finish: CardFinish,
    /// Signed state
    pub signed: bool,
    /// Paid price per copy
    pub purchase_price_cents: Option<i64>,
}
