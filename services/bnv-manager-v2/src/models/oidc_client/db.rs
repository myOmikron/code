//! Database models of OIDC clients and their authorization codes

use galvyn::rorm::Model;
use galvyn::rorm::fields::types::Json;
use galvyn::rorm::fields::types::MaxStr;
use galvyn::rorm::prelude::ForeignModel;
use url::Url;
use uuid::Uuid;

use crate::models::account::db::ClubAccountModel;

/// A registered relying party
#[derive(Debug, Model)]
#[rorm(rename = "OidcClient")]
pub struct OidcClientModel {
    /// Client id
    #[rorm(primary_key)]
    pub uuid: Uuid,
    /// Human-readable name
    pub name: MaxStr<255>,
    /// Secret the client authenticates with
    pub client_secret: MaxStr<64>,
    /// The registered redirect uri
    #[rorm(max_length = 1024, rename = "redirect_url")]
    pub redirect_uri: Url,
}

/// An authorization code issued to a client
#[derive(Debug, Model)]
#[rorm(rename = "OidcAuthenticationToken")]
pub struct OidcAuthenticationTokenModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,
    /// The client the code was issued to
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub client: ForeignModel<OidcClientModel>,
    /// The redirect uri the code was issued for
    #[rorm(max_length = 1024, rename = "redirect_url")]
    pub redirect_uri: Url,
    /// The code
    #[rorm(unique)]
    pub code: MaxStr<64>,
    /// The point in time the code expires
    pub expires_at: time::OffsetDateTime,
    /// The account that authorized the client
    #[rorm(on_update = "Cascade", on_delete = "Cascade")]
    pub account: ForeignModel<ClubAccountModel>,
    /// Nonce of the authorization request
    pub nonce: Option<MaxStr<255>>,
    /// Scopes the client requested
    pub scopes: Json<Vec<String>>,
    /// PKCE code challenge (RFC 7636)
    pub code_challenge: Option<MaxStr<128>>,
    /// When the account signed in, `None` only for codes issued before it was recorded
    pub auth_time: Option<time::OffsetDateTime>,
}
