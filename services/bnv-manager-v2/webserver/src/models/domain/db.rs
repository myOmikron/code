use galvyn::rorm::Model;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use uuid::Uuid;

use crate::models::club::db::ClubModel;

#[derive(Debug, Model)]
#[rorm(rename = "Domain")]
pub struct DomainModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    #[rorm(unique)]
    pub domain: MaxStr<255>,
    pub club: Option<ForeignModel<ClubModel>>,
    #[rorm(default = "false")]
    pub is_primary: bool,
    /// How many mailboxes can be created on this domain
    pub mailboxes_left: i64,
}
