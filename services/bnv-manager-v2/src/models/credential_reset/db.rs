use galvyn::rorm::Model;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use uuid::Uuid;

use crate::models::account::db::AdministrativeAccountModel;
use crate::models::account::db::ClubAccountModel;
use crate::models::account::db::ClubAdminAccountModel;

#[derive(Model)]
#[rorm(rename = "CredentialResetSuperadmin")]
pub struct CredentialResetSuperadminModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<AdministrativeAccountModel>,

    pub code: MaxStr<6>,
    pub code_expires_at: time::OffsetDateTime,
    pub link_expires_at: time::OffsetDateTime,
}

#[derive(Model)]
#[rorm(rename = "CredentialResetClubAdmin")]
pub struct CredentialResetClubAdminModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<ClubAdminAccountModel>,

    pub code: MaxStr<6>,
    pub code_expires_at: time::OffsetDateTime,
    pub link_expires_at: time::OffsetDateTime,
}

#[derive(Model)]
#[rorm(rename = "CredentialResetClubAccount")]
pub struct CredentialResetClubAccountModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<ClubAccountModel>,

    pub code: MaxStr<6>,
    pub code_expires_at: time::OffsetDateTime,
    pub link_expires_at: time::OffsetDateTime,
}
