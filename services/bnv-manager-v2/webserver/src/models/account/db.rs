use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use uuid::Uuid;

use crate::models::club::db::ClubModel;

#[derive(Debug, Model)]
#[rorm(rename = "AdministrativeAccount")]
pub struct AdministrativeAccountModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub username: ForeignModel<UsernameModel>,
    pub display_name: MaxStr<255>,

    pub hashed_password: MaxStr<255>,

    #[rorm(auto_create_time, auto_update_time)]
    pub modified_at: time::OffsetDateTime,
    #[rorm(auto_create_time)]
    pub created_at: time::OffsetDateTime,
}

#[derive(Debug, Model)]
#[rorm(rename = "ClubAdminAccount")]
pub struct ClubAdminAccountModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub username: ForeignModel<UsernameModel>,
    pub display_name: MaxStr<255>,

    pub hashed_password: MaxStr<255>,

    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub club: ForeignModel<ClubModel>,

    #[rorm(auto_create_time, auto_update_time)]
    pub modified_at: time::OffsetDateTime,
    #[rorm(auto_create_time)]
    pub created_at: time::OffsetDateTime,
}

#[derive(Debug, Model)]
#[rorm(rename = "ClubAccount")]
pub struct ClubAccountModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,

    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub username: ForeignModel<UsernameModel>,
    pub display_name: MaxStr<255>,
    #[rorm(unique)]
    pub email: MaxStr<255>,

    pub hashed_password: MaxStr<255>,

    /// Whether the account already has an app password set.
    #[rorm(default = "false")]
    pub has_app_password: bool,

    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub club: ForeignModel<ClubModel>,

    #[rorm(auto_create_time, auto_update_time)]
    pub modified_at: time::OffsetDateTime,
    #[rorm(auto_create_time)]
    pub created_at: time::OffsetDateTime,
}

#[derive(Debug, Model)]
pub struct UsernameModel {
    /// Must be converted to lowercase
    #[rorm(primary_key)]
    pub username: MaxStr<255>,
}

#[derive(Debug, Patch)]
#[rorm(model = "AdministrativeAccountModel")]
pub struct AdministrativeAccountModelInsert {
    pub uuid: Uuid,
    pub username: ForeignModel<UsernameModel>,
    pub display_name: MaxStr<255>,
    pub hashed_password: MaxStr<255>,
}

#[derive(Debug, Patch)]
#[rorm(model = "ClubAdminAccountModel")]
pub struct ClubAdminAccountModelInsert {
    pub uuid: Uuid,
    pub username: ForeignModel<UsernameModel>,
    pub display_name: MaxStr<255>,
    pub hashed_password: MaxStr<255>,
    pub club: ForeignModel<ClubModel>,
}

#[derive(Debug, Patch)]
#[rorm(model = "ClubAccountModel")]
pub struct ClubAccountModelInsert {
    pub uuid: Uuid,
    pub username: ForeignModel<UsernameModel>,
    pub display_name: MaxStr<255>,
    pub hashed_password: MaxStr<255>,
    pub email: MaxStr<255>,
    pub club: ForeignModel<ClubModel>,
}
