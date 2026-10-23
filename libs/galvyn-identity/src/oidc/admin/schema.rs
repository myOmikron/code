//! Requests and responses of the OpenID provider admin handlers

use galvyn::core::re_exports::schemars;
use galvyn::core::re_exports::schemars::JsonSchema;
use galvyn::rorm::fields::types::MaxStr;
use serde::Deserialize;
use serde::Serialize;

use crate::oidc::Admission;
use crate::oidc::InvalidOpenIdProvider;
use crate::oidc::OpenIdProvider;

/// Who an OpenID provider admits on their first OIDC login
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AdminOpenIdProviderAdmission {
    /// Everyone it vouches for
    Open,
    /// Only those holding a Registration link
    InviteOnly,
}

/// An OpenID provider as an admin sees it, without its client secret
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminOpenIdProvider {
    /// The service's own short name for the provider, ending its redirect uri
    pub slug: String,
    /// What the login page calls the provider
    pub display_name: String,
    /// Where the provider's discovery document is, or its issuer
    pub discovery_url: String,
    /// The issuer its discovery stated, `None` before its first discovery
    pub issuer: Option<String>,
    /// The client id the provider issued the service
    pub client_id: String,
    /// The ID token claim whose value identifies a person
    pub identifying_claim: String,
    /// Who the provider admits on their first OIDC login
    pub admission: AdminOpenIdProviderAdmission,
    /// Whether people may log in through the provider
    pub active: bool,
}

/// Every OpenID provider, deactivated ones included
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct AdminListOpenIdProvidersResponse {
    /// The providers, by slug
    pub providers: Vec<AdminOpenIdProvider>,
}

/// Request to add an OpenID provider
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminCreateOpenIdProviderRequest {
    /// The service's own short name for the provider: lowercase letters, digits and `-`
    pub slug: MaxStr<64>,
    /// What the login page calls the provider
    pub display_name: MaxStr<255>,
    /// Where the provider's discovery document is, or its issuer
    pub discovery_url: MaxStr<255>,
    /// The client id the provider issued the service
    pub client_id: MaxStr<255>,
    /// The client secret the provider issued the service, never answered
    pub client_secret: MaxStr<1024>,
    /// The ID token claim whose value identifies a person, usually `sub`
    pub identifying_claim: MaxStr<64>,
    /// Who the provider admits on their first OIDC login
    pub admission: AdminOpenIdProviderAdmission,
}

/// Request to edit an OpenID provider; its slug stays
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct AdminEditOpenIdProviderRequest {
    /// What the login page calls the provider
    pub display_name: MaxStr<255>,
    /// Where the provider's discovery document is, or its issuer
    ///
    /// Refused if it names another issuer while an External identity references the provider.
    pub discovery_url: MaxStr<255>,
    /// The client id the provider issued the service
    pub client_id: MaxStr<255>,
    /// A new client secret, left out to keep the stored one
    #[serde(default)]
    pub client_secret: Option<MaxStr<1024>>,
    /// The ID token claim whose value identifies a person
    ///
    /// Refused if it changes while an External identity references the provider.
    pub identifying_claim: MaxStr<64>,
    /// Who the provider admits on their first OIDC login
    pub admission: AdminOpenIdProviderAdmission,
}

/// A field of an OpenID provider that cannot be stored or used
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AdminOpenIdProviderField {
    /// Empty, or not only lowercase letters, digits and `-`
    Slug,
    /// Empty
    DisplayName,
    /// No http(s) url
    DiscoveryUrl,
    /// Empty
    ClientId,
    /// Empty
    ClientSecret,
    /// Empty
    IdentifyingClaim,
}

/// Why an OpenID provider could not be added
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct AdminCreateOpenIdProviderErrors {
    /// The first unusable field, if any
    pub invalid_field: Option<AdminOpenIdProviderField>,
    /// Another provider has the slug
    pub slug_taken: bool,
}

/// Why an OpenID provider could not be edited
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct AdminEditOpenIdProviderErrors {
    /// The first unusable field, if any
    pub invalid_field: Option<AdminOpenIdProviderField>,
    /// The identifying claim changed while an External identity references the provider
    pub identifying_claim_frozen: bool,
    /// The discovery url names another issuer while an External identity references the provider
    pub issuer_frozen: bool,
}

/// Why an OpenID provider could not be deleted
#[derive(Debug, Default, Serialize, JsonSchema)]
pub struct AdminDeleteOpenIdProviderErrors {
    /// An External identity references the provider; deactivate it instead
    pub referenced: bool,
}

impl From<AdminOpenIdProviderAdmission> for Admission {
    fn from(value: AdminOpenIdProviderAdmission) -> Self {
        match value {
            AdminOpenIdProviderAdmission::Open => Admission::Open,
            AdminOpenIdProviderAdmission::InviteOnly => Admission::InviteOnly,
        }
    }
}

impl From<Admission> for AdminOpenIdProviderAdmission {
    fn from(value: Admission) -> Self {
        match value {
            Admission::Open => AdminOpenIdProviderAdmission::Open,
            Admission::InviteOnly => AdminOpenIdProviderAdmission::InviteOnly,
        }
    }
}

impl From<InvalidOpenIdProvider> for AdminOpenIdProviderField {
    fn from(value: InvalidOpenIdProvider) -> Self {
        match value {
            InvalidOpenIdProvider::Slug => AdminOpenIdProviderField::Slug,
            InvalidOpenIdProvider::DisplayName => AdminOpenIdProviderField::DisplayName,
            InvalidOpenIdProvider::DiscoveryUrl => AdminOpenIdProviderField::DiscoveryUrl,
            InvalidOpenIdProvider::ClientId => AdminOpenIdProviderField::ClientId,
            InvalidOpenIdProvider::ClientSecret => AdminOpenIdProviderField::ClientSecret,
            InvalidOpenIdProvider::IdentifyingClaim => AdminOpenIdProviderField::IdentifyingClaim,
        }
    }
}

impl From<OpenIdProvider> for AdminOpenIdProvider {
    fn from(value: OpenIdProvider) -> Self {
        Self {
            slug: value.slug,
            display_name: value.display_name,
            discovery_url: value.discovery_url,
            issuer: value.issuer,
            client_id: value.client_id,
            identifying_claim: value.identifying_claim,
            admission: value.admission.into(),
            active: value.active,
        }
    }
}
