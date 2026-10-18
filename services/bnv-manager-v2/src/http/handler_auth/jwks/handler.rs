//! Handler of the JSON Web Key Set

use galvyn::core::Module;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use tracing::instrument;

use crate::http::handler_auth::JWKS_PATH;
use crate::modules::oidc::Oidc;

/// The public keys tokens of this provider are signed with (RFC 7517)
#[get(JWKS_PATH)]
#[instrument(name = "Api::auth::jwks")]
pub async fn jwks() -> ApiJson<serde_json::Value> {
    ApiJson(Oidc::global().jwks.clone())
}
