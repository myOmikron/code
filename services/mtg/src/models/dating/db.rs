//! Database models backing [`super`]

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::models::account::db::AccountModel;
use crate::models::dating::DateStatus;
use crate::models::dating::GraphProfile;

/// One swipe of an account on a Commander
#[derive(Model, Debug)]
#[rorm(rename = "dating_swipe")]
pub struct DatingSwipeModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// Who swiped
    #[rorm(index, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// The Commander's oracle id
    pub commander: Uuid,

    /// Where the date stands
    pub status: DateStatus,

    /// Swiped up: a guaranteed match
    #[rorm(default = false)]
    pub super_like: bool,

    /// Restored with "No, come back" after a rejection or unmatch
    #[rorm(default = false)]
    pub came_back: bool,

    /// Compatibility the Commander saw, 0 for a pass
    pub score: f64,

    /// The dimension a rejection names
    pub dimension: Option<MaxStr<16>>,

    /// Whether the Commander wants more or less of that dimension
    pub direction: Option<MaxStr<8>>,

    /// The missing interest or colors behind a rejection
    pub detail: Option<MaxStr<64>>,

    /// The interest both sides share
    pub shared: Option<MaxStr<64>>,

    /// When the swipe happened
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`DatingSwipeModel`]
#[derive(Patch)]
#[rorm(model = "DatingSwipeModel")]
pub struct DatingSwipeInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Who swiped
    pub owner: ForeignModel<AccountModel>,
    /// The Commander's oracle id
    pub commander: Uuid,
    /// Where the date stands
    pub status: DateStatus,
    /// Swiped up
    pub super_like: bool,
    /// Compatibility the Commander saw
    pub score: f64,
    /// The dimension a rejection names
    pub dimension: Option<MaxStr<16>>,
    /// More or less of that dimension
    pub direction: Option<MaxStr<8>>,
    /// The missing interest or colors
    pub detail: Option<MaxStr<64>>,
    /// The interest both sides share
    pub shared: Option<MaxStr<64>>,
}

/// An account's dating profile: its answers and the last profile built from its decks
#[derive(Model, Debug)]
#[rorm(rename = "dating_profile")]
pub struct DatingProfileModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// Whose profile this is
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub owner: ForeignModel<AccountModel>,

    /// Answered colors, as letters of WUBRG
    pub colors: MaxStr<8>,

    /// Answered bracket
    pub bracket: Option<i16>,

    /// Answered deck budget in euro
    pub budget_eur: Option<i32>,

    /// Whether the questions were answered at all
    #[rorm(default = false)]
    pub answered: bool,

    /// The profile last built by the advisor
    pub snapshot: Option<Json<GraphProfile>>,

    /// Fingerprint of the decks and answers the snapshot was built from
    pub snapshot_key: Option<MaxStr<32>>,
}

/// Insert patch for [`DatingProfileModel`]
#[derive(Patch)]
#[rorm(model = "DatingProfileModel")]
pub struct DatingProfileInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// Whose profile this is
    pub owner: ForeignModel<AccountModel>,
    /// Answered colors
    pub colors: MaxStr<8>,
    /// Answered bracket
    pub bracket: Option<i16>,
    /// Answered deck budget in euro
    pub budget_eur: Option<i32>,
    /// Whether the questions were answered
    pub answered: bool,
    /// The profile last built by the advisor
    pub snapshot: Option<Json<GraphProfile>>,
    /// Fingerprint of the snapshot's inputs
    pub snapshot_key: Option<MaxStr<32>>,
}
