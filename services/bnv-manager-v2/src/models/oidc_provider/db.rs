use galvyn::rorm::Model;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use url::Url;
use uuid::Uuid;

use crate::models::account::db::ClubAccountModel;

#[derive(Debug, Model)]
#[rorm(rename = "OidcClient")]
pub struct OidcClientModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    pub name: MaxStr<255>,
    pub client_secret: MaxStr<64>,
    #[rorm(max_length = 1024)]
    pub redirect_url: Url,
}

#[derive(Debug, Model)]
#[rorm(rename = "OidcAuthenticationToken")]
pub struct OidcAuthenticationTokenModel {
    #[rorm(primary_key)]
    pub uuid: Uuid,
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub client: ForeignModel<OidcClientModel>,
    #[rorm(max_length = 1024)]
    pub redirect_url: Url,
    #[rorm(unique)]
    pub code: MaxStr<64>,
    pub expires_at: time::OffsetDateTime,
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<ClubAccountModel>,
    pub nonce: Option<MaxStr<255>>,
    pub scopes: Json<Vec<String>>,
    /// PKCE code challenge (RFC 7636)
    pub code_challenge: Option<MaxStr<128>>,
}
