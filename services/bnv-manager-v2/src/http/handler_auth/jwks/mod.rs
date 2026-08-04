//! JSON Web Key Set endpoint for OIDC authentication
//!
//! This module provides the `/jwks.json` endpoint that serves the JSON Web Key Set
//! (JWKS) used for verifying JWT tokens in OIDC authentication flows. The endpoint
//! returns the public keys that clients can use to validate signatures of JWTs
//! issued by this authorization server.

use galvyn::core::Module;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use tracing::instrument;

use crate::modules::oidc::Oidc;

#[get("/jwks.json")]
#[instrument(name = "Api::auth::jwks.json")]
pub async fn jwks() -> ApiJson<serde_json::Value> {
    ApiJson(Oidc::global().jwks.clone())
}
