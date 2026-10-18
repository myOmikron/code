//! Schema for managing OIDC clients

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;
use url::Url;

use crate::models::oidc_client::OidcClient;
use crate::models::oidc_client::OidcClientUuid;

/// A registered OIDC client, without its secret
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OidcClientSchema {
    /// Client id of the client
    pub client_id: OidcClientUuid,
    /// Human-readable name
    pub name: MaxStr<255>,
    /// The client's registered redirect uri
    pub redirect_uri: Url,
}

/// Request to register an OIDC client
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateOidcClientRequest {
    /// Human-readable name
    pub name: MaxStr<255>,
    /// The client's redirect uri
    ///
    /// Must be an absolute url using `https`, or `http` on localhost, and must not contain
    /// a fragment.
    pub redirect_uri: MaxStr<1024>,
}

/// The credentials of a newly registered OIDC client
///
/// This is the only time the secret is returned.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreatedOidcClient {
    /// Client id of the client
    pub client_id: OidcClientUuid,
    /// Secret the client authenticates with
    pub client_secret: MaxStr<64>,
}

/// Errors when registering an OIDC client
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct CreateOidcClientError {
    /// The redirect uri is no absolute url, not `https` (or `http` on localhost) or
    /// contains a fragment
    pub invalid_redirect_uri: bool,
}

impl From<OidcClient> for OidcClientSchema {
    fn from(value: OidcClient) -> Self {
        Self {
            client_id: value.client_id,
            name: value.name,
            redirect_uri: value.redirect_uri,
        }
    }
}
