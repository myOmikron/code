use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use uuid::Uuid;

use crate::models::account::db::UsernameModel;
use crate::models::club::db::ClubModel;

#[derive(Debug, Model)]
pub struct InviteModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    #[rorm(unique, on_update = "Cascade", on_delete = "Cascade")]
    pub username: ForeignModel<UsernameModel>,
    pub display_name: MaxStr<255>,

    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub club: Option<ForeignModel<ClubModel>>,
    pub email: Option<MaxStr<255>>,

    pub expires_at: time::OffsetDateTime,

    #[rorm(auto_create_time)]
    pub created_at: time::OffsetDateTime,
}

#[derive(Debug, Patch)]
#[rorm(model = "InviteModel")]
pub struct InviteModelInsert {
    pub uuid: Uuid,
    pub username: ForeignModel<UsernameModel>,
    pub display_name: MaxStr<255>,
    pub club: Option<ForeignModel<ClubModel>>,
    pub email: Option<MaxStr<255>>,
    pub expires_at: time::OffsetDateTime,
}
