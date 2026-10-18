//! Schema of the authorization endpoint and the login steps around it

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use url::Url;
use uuid::Uuid;

use crate::models::oidc_client::OidcClientUuid;

/// Sign in request
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SignInRequest {
    /// Username
    pub username: MaxStr<255>,
    /// Password
    pub password: MaxStr<72>,
}

/// Query parameters of the authorization endpoint, as the OpenAPI spec documents them
///
/// The endpoint reads them raw (see [`AuthRequestParams`](super::request::AuthRequestParams)),
/// so it can answer malformed requests with an error redirect.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthQuery {
    /// Client id
    pub client_id: OidcClientUuid,
    /// Where to send the user with the authorization code
    pub redirect_uri: Url,
    /// Space separated scopes the client requests
    pub scope: MaxStr<1024>,
    /// Opaque value returned to the client unchanged
    pub state: Option<MaxStr<1024>>,
    /// Only "code" is supported
    pub response_type: MaxStr<255>,
    /// Only "query" is supported
    pub response_mode: Option<MaxStr<255>>,
    /// Value the ID token echoes, binding it to this request
    pub nonce: Option<MaxStr<255>>,
    /// PKCE code challenge (RFC 7636)
    pub code_challenge: Option<MaxStr<128>>,
    /// PKCE code challenge method, "S256" or "plain" (the default)
    pub code_challenge_method: Option<MaxStr<255>>,
    /// Space separated: "none" fails instead of showing the login page, "login" forces
    /// the login page, "consent" and "select_account" are ignored
    pub prompt: Option<MaxStr<255>>,
    /// Seconds since the last login, beyond that the login page is shown again
    pub max_age: Option<u64>,
}

/// Id of an authorization request waiting in the session for the login step
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct PendingAuthorizationId(pub Uuid);

/// Query parameters of the step finishing the authorization
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FinishAuthQuery {
    /// The pending authorization request to resume
    pub request_id: PendingAuthorizationId,
}
