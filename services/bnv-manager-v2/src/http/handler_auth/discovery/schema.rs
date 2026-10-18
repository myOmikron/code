//! Schema of the discovery document

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use url::Url;

/// The OpenID provider's metadata (OpenID Connect Discovery 1.0, section 3)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DiscoveryResponse {
    /// Identifier of the OpenID provider, the `iss` of its tokens
    pub issuer: Url,
    /// Url of the authorization endpoint
    pub authorization_endpoint: Url,
    /// Url of the token endpoint
    pub token_endpoint: Url,
    /// Url of the userinfo endpoint
    pub userinfo_endpoint: Url,
    /// Url of the JSON Web Key Set
    pub jwks_uri: Url,
    /// Supported `scope` values
    pub scopes_supported: Vec<String>,
    /// Supported `response_type` values
    pub response_types_supported: Vec<String>,
    /// Supported `response_mode` values
    pub response_modes_supported: Vec<String>,
    /// Supported `grant_type` values
    pub grant_types_supported: Vec<String>,
    /// Supported client authentication methods of the token endpoint
    pub token_endpoint_auth_methods_supported: Vec<String>,
    /// Supported PKCE `code_challenge_method` values (RFC 8414 §2)
    pub code_challenge_methods_supported: Vec<String>,
    /// Supported subject identifier types
    pub subject_types_supported: Vec<String>,
    /// Supported signing algorithms of the ID token
    pub id_token_signing_alg_values_supported: Vec<String>,
    /// Claims the provider may supply values for
    pub claims_supported: Vec<String>,
}
