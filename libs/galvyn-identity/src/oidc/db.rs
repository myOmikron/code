//! Database models of the OpenID providers and the External identities

use galvyn::core::re_exports::time::OffsetDateTime;
use galvyn::rorm::Model;
use galvyn::rorm::Patch;
use galvyn::rorm::fields::types::ForeignModel;
use galvyn::rorm::fields::types::MaxStr;
use uuid::Uuid;

use crate::db::IdentityModel;

/// An OpenID provider people may log in through, configured at runtime
#[derive(Model)]
#[rorm(rename = "openid_provider")]
pub struct OpenIdProviderModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The service's own short name for the provider, e.g. `google`
    ///
    /// Names the provider in the redirect uri and when beginning a Login.
    #[rorm(unique)]
    pub slug: MaxStr<64>,

    /// What the frontend calls the provider, e.g. `Google`
    pub display_name: MaxStr<255>,

    /// Where the provider's discovery document is, or its issuer below which it is
    pub discovery_url: MaxStr<255>,

    /// The issuer the discovery document states, once discovery succeeded
    pub issuer: Option<MaxStr<255>>,

    /// The client id the provider issued the service
    pub client_id: MaxStr<255>,

    /// The secret the service authenticates to the provider's token endpoint with
    pub client_secret: MaxStr<1024>,

    /// The ID token claim whose value identifies a person, `sub` by default
    pub identifying_claim: MaxStr<64>,

    /// Who the provider admits on their first OIDC login, see `Admission`
    pub admission: MaxStr<16>,

    /// The point in time the provider was added
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`OpenIdProviderModel`]
#[derive(Patch)]
#[rorm(model = "OpenIdProviderModel")]
pub struct OpenIdProviderInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The service's own short name for the provider
    pub slug: MaxStr<64>,
    /// What the frontend calls the provider
    pub display_name: MaxStr<255>,
    /// Where the provider's discovery document is
    pub discovery_url: MaxStr<255>,
    /// The issuer, unknown before the first discovery
    pub issuer: Option<MaxStr<255>>,
    /// The client id the provider issued the service
    pub client_id: MaxStr<255>,
    /// The secret the service authenticates with
    pub client_secret: MaxStr<1024>,
    /// The ID token claim whose value identifies a person
    pub identifying_claim: MaxStr<64>,
    /// Who the provider admits on their first OIDC login
    pub admission: MaxStr<16>,
}

/// A person as one OpenID provider knows them, bound to an external [`IdentityModel`]
#[derive(Model)]
#[rorm(rename = "external_identity")]
pub struct ExternalIdentityModel {
    /// Primary key
    #[rorm(primary_key)]
    pub uuid: Uuid,

    /// The external Identity this External identity is bound to
    ///
    /// Unique: an external Identity holds exactly one External identity. Its
    /// unique index also serves the login method of an Identity, which
    /// filters on it.
    #[rorm(unique, on_delete = "Cascade", on_update = "Cascade")]
    pub identity: ForeignModel<IdentityModel>,

    /// The OpenID provider vouching for the person
    ///
    /// A provider is only deleted once no External identity references it.
    #[rorm(index, on_delete = "Restrict", on_update = "Cascade")]
    pub provider: ForeignModel<OpenIdProviderModel>,

    /// The provider's issuer when the External identity was bound
    pub issuer: MaxStr<255>,

    /// The value of the provider's identifying claim
    pub value: MaxStr<255>,

    /// Provider and value joined by a space, keeping the pair unique
    ///
    /// rorm declares no unique constraint over two columns. The provider is a
    /// uuid and holds no space, so the joined value names exactly one pair.
    #[rorm(unique)]
    pub provider_value: MaxStr<292>,

    /// The point in time this External identity was enrolled
    #[rorm(auto_create_time)]
    pub created_at: OffsetDateTime,
}

/// Insert patch for [`ExternalIdentityModel`]
#[derive(Patch)]
#[rorm(model = "ExternalIdentityModel")]
pub struct ExternalIdentityInsertPatch {
    /// Primary key
    pub uuid: Uuid,
    /// The external Identity this External identity is bound to
    pub identity: ForeignModel<IdentityModel>,
    /// The OpenID provider vouching for the person
    pub provider: ForeignModel<OpenIdProviderModel>,
    /// The provider's issuer
    pub issuer: MaxStr<255>,
    /// The value of the provider's identifying claim
    pub value: MaxStr<255>,
    /// Provider and value joined by a space
    pub provider_value: MaxStr<292>,
}
