//! Schema for the authentication endpoints

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use url::Url;

use crate::models::oidc_provider::OidcClientUuid;

/// Sign in request
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SignInRequest {
    /// Username
    pub username: MaxStr<255>,
    /// Password
    pub password: MaxStr<72>,
}

/// Query parameters for the auth endpoint
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthQuery {
    /// Client id
    pub client_id: OidcClientUuid,
    /// URL to redirect the user to after successful authentication
    pub redirect_uri: Url,
    /// The scopes the application requests
    pub scope: String,
    /// Pass-through parameter
    pub state: Option<String>,
    /// Only "code" is currently supported
    pub response_type: String,
    /// Only "query" is currently supported
    pub response_mode: Option<String>,
    /// Optional nonce for protection against replay attacks
    pub nonce: Option<MaxStr<255>>,
    /// PKCE code challenge (RFC 7636)
    pub code_challenge: Option<MaxStr<128>>,
    /// PKCE code challenge method, only "S256" is supported
    pub code_challenge_method: Option<String>,
}
