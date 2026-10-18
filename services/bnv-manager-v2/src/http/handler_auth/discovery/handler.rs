//! Handler of the discovery document

use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;
use tracing::instrument;

use crate::http::handler_auth::AUTHORIZATION_PATH;
use crate::http::handler_auth::DISCOVERY_PATH;
use crate::http::handler_auth::JWKS_PATH;
use crate::http::handler_auth::TOKEN_PATH;
use crate::http::handler_auth::USERINFO_PATH;
use crate::http::handler_auth::auth::handler::ALLOWED_SCOPES;
use crate::http::handler_auth::discovery::schema::DiscoveryResponse;
use crate::http::handler_auth::endpoint_url;
use crate::http::handler_auth::issuer;
use crate::http::handler_auth::pkce;

/// Claims the ID token and the userinfo response may contain
pub const CLAIMS_SUPPORTED: &[&str] = &[
    "iss",
    "sub",
    "aud",
    "exp",
    "iat",
    "azp",
    "nonce",
    "auth_time",
    "email",
    "email_verified",
    "preferred_username",
    "name",
    "mailcow_template",
];

/// The OpenID provider's metadata (OpenID Connect Discovery 1.0)
#[get(DISCOVERY_PATH)]
#[instrument(name = "Api::auth::discovery")]
pub async fn discovery() -> ApiResult<ApiJson<DiscoveryResponse>> {
    Ok(ApiJson(DiscoveryResponse {
        issuer: issuer(),
        authorization_endpoint: endpoint_url(AUTHORIZATION_PATH),
        token_endpoint: endpoint_url(TOKEN_PATH),
        userinfo_endpoint: endpoint_url(USERINFO_PATH),
        jwks_uri: endpoint_url(JWKS_PATH),
        scopes_supported: ALLOWED_SCOPES.iter().map(|x| x.to_string()).collect(),
        response_types_supported: vec!["code".to_string()],
        response_modes_supported: vec!["query".to_string()],
        grant_types_supported: vec!["authorization_code".to_string()],
        token_endpoint_auth_methods_supported: vec![
            "client_secret_basic".to_string(),
            "client_secret_post".to_string(),
        ],
        code_challenge_methods_supported: pkce::CODE_CHALLENGE_METHODS
            .iter()
            .map(|x| x.to_string())
            .collect(),
        subject_types_supported: vec!["public".to_string()],
        id_token_signing_alg_values_supported: vec!["RS256".to_string()],
        claims_supported: CLAIMS_SUPPORTED.iter().map(|x| x.to_string()).collect(),
    }))
}
