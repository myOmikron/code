use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use url::Url;

/// Response for the discovery endpoint
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[allow(missing_docs)]
pub struct DiscoveryResponse {
    pub issuer: Url,
    pub authorization_endpoint: Url,
    pub token_endpoint: Url,
    pub userinfo_endpoint: Url,
    pub jwks_uri: Url,
    pub response_types_supported: Vec<String>,
    pub subject_types_supported: Vec<String>,
    pub id_token_signing_alg_values_supported: Vec<String>,
}
