//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;

/// An MPCFill image an account starred
#[derive(Model, Debug)]
#[rorm(rename = "mpcfill_favorite")]
pub struct MpcFillFavoriteModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account that starred it
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// The card face it was starred for, `None` for a cardback
    pub face: Option<MaxStr<255>>,

    /// The image's Google Drive file id
    pub drive_id: MaxStr<128>,

    /// The file's name in its drive
    pub file_name: MaxStr<255>,

    /// The drive it lies in
    pub source: MaxStr<255>,

    /// Its resolution
    pub dpi: i64,

    /// Its size in bytes
    pub size: i64,

    /// When it was starred
    #[rorm(auto_create_time)]
    pub starred_at: OffsetDateTime,
}

/// Insert patch for [`MpcFillFavoriteModel`]
#[derive(Patch)]
#[rorm(model = "MpcFillFavoriteModel")]
pub struct MpcFillFavoriteInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The account that starred it
    pub owner: ForeignModel<AccountModel>,
    /// The card face, `None` for a cardback
    pub face: Option<MaxStr<255>>,
    /// The Google Drive file id
    pub drive_id: MaxStr<128>,
    /// The file's name
    pub file_name: MaxStr<255>,
    /// The drive
    pub source: MaxStr<255>,
    /// The resolution
    pub dpi: i64,
    /// The size in bytes
    pub size: i64,
}

/// An MPCFill drive an account starred
#[derive(Model, Debug)]
#[rorm(rename = "mpcfill_favorite_drive")]
pub struct MpcFillFavoriteDriveModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The account that starred it
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// The drive's name
    pub source: MaxStr<255>,

    /// Where it stands in the account's list, from 0
    pub position: i32,
}

/// Insert patch for [`MpcFillFavoriteDriveModel`]
#[derive(Patch)]
#[rorm(model = "MpcFillFavoriteDriveModel")]
pub struct MpcFillFavoriteDriveInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The account that starred it
    pub owner: ForeignModel<AccountModel>,
    /// The drive's name
    pub source: MaxStr<255>,
    /// Where it stands in the list
    pub position: i32,
}
