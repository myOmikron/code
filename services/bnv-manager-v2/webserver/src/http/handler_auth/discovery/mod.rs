//! Discovery endpoint of oidc

mod schema;

use galvyn::core::stuff::api_error::ApiResult;
use galvyn::core::stuff::api_json::ApiJson;
use galvyn::get;

use crate::config::ORIGIN;
use crate::http::handler_auth::discovery::schema::DiscoveryResponse;

#[get("/.well-known/openid-configuration")]
pub async fn discovery() -> ApiResult<ApiJson<DiscoveryResponse>> {
    #[allow(clippy::unwrap_used)]
    Ok(ApiJson(DiscoveryResponse {
        issuer: ORIGIN.join("/api/v1/auth").unwrap(),
        authorization_endpoint: ORIGIN.join("/api/v1/auth/auth").unwrap(),
        token_endpoint: ORIGIN.join("/api/v1/auth/token").unwrap(),
        userinfo_endpoint: ORIGIN.join("/api/v1/auth/userinfo").unwrap(),
        jwks_uri: ORIGIN.join("/api/v1/auth/jwks.json").unwrap(),
        response_types_supported: vec!["code".to_string()],
        subject_types_supported: vec!["public".to_string()],
        id_token_signing_alg_values_supported: vec!["RS256".to_string()],
    }))
}
