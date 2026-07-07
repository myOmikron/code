use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::field;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::BackRef;
use uuid::Uuid;

use crate::models::account::db::ClubAccountModel;
use crate::models::account::db::ClubAdminAccountModel;
use crate::models::domain::db::DomainModel;

#[derive(Debug, Model)]
#[rorm(rename = "Club")]
pub struct ClubModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    pub name: MaxStr<255>,

    /// Whether to use X-Auth for authentication
    /// If set to false, bnv-manager is attempting to create an app password for
    /// all users and to keep them in sync
    #[rorm(default = "false")]
    pub use_xauth: bool,

    #[rorm(auto_create_time, auto_update_time)]
    pub modified_at: time::OffsetDateTime,
    #[rorm(auto_create_time)]
    pub created_at: time::OffsetDateTime,

    pub members: BackRef<field!(ClubAccountModel.club)>,
    pub admins: BackRef<field!(ClubAdminAccountModel.club)>,

    pub domains: BackRef<field!(DomainModel.club)>,
}

#[derive(Debug, Patch)]
#[rorm(model = "ClubModel")]
pub struct ClubModelInsert {
    pub uuid: Uuid,
    pub name: MaxStr<255>,
    pub use_xauth: bool,
}
