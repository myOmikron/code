use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use url::Url;

use crate::models::oidc_provider::OidcClientUuid;

/// A single OIDC Provider
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OidcProvider {
    /// client id of the provider
    pub client_id: OidcClientUuid,
    /// Secret of the provider
    pub client_secret: MaxStr<64>,
    /// Human-readable name
    pub name: MaxStr<255>,
    /// Redirect url associated with the provider
    pub redirect_uri: Url,
}

/// Request to create an oidc provider
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateOidcProvider {
    /// Name of the oidc provider
    pub name: MaxStr<255>,
    /// Redirect url of the oidc provider
    pub redirect_uri: Url,
}

impl From<crate::models::oidc_provider::OidcClient> for OidcProvider {
    fn from(value: crate::models::oidc_provider::OidcClient) -> Self {
        Self {
            client_id: value.client_id,
            client_secret: value.client_secret,
            name: value.name,
            redirect_uri: value.redirect_uri,
        }
    }
}
